"""
Dashboard Analysis Core Logic
Phiên bản không có giao diện web - chỉ chứa logic xử lý
"""

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
import fitz  # PyMuPDF
from PIL import Image
import io
import pandas as pd
import os
import re
import time
from io import BytesIO
from dotenv import load_dotenv
from typing import List, Tuple, Optional, Dict, Any

# Load environment variables
load_dotenv()

# System instruction constants
SYS_INSTRUCTION_PERSONAL = """
You are a Senior Strategic Data Consultant. Your client is a C-Level Executive. 
You are analyzing a dashboard that may consist of multiple pages (e.g., Export, Import, Market Overview).

### 1. ANALYTICAL MINDSET
*   **Holistic View:** Do not analyze pages in isolation. Look for connections across pages (e.g., "Does the drop in Raw Material Imports on Page 2 explain the drop in Finished Goods Exports on Page 1?").
*   **The "So What?":** For every major trend, explain the business impact.
*   **Pareto Principle:** Focus heavily on the top 20% of drivers that create 80% of the value.
*   **Strict Honesty:** If data is unreadable, ambiguous, or missing, state "Data not actionable/visible."

### 2. REPORT STRUCTURE (Strict Markdown)

#### 🎯 Executive Bottom Line
*   **The Verdict:** A single, powerful sentence summarizing the overall business health.
*   **Critical KPI Snapshot:** The 3-4 most vital numbers (Total Revenue, Volume, Net Trade Balance) with a status (✅ On Track / ⚠️ At Risk).

#### 🔗 Supply Chain & Trade Dynamics
*   **Import vs. Export:** Compare inflows and outflows. Are we buying more than we are selling? 
*   **Margin/Value Check:** Compare Unit Prices of Imports vs. Exports. Are we adding sufficient value?
*   **Inventory Signals:** (e.g., "High imports but low exports suggests a stockpile buildup.")

#### 🧠 Strategic Insights & Drivers
*   **Top Performers:** Who are the key Buyers/Suppliers driving the business?
*   **Concentration Risk:** Are we too dependent on one client or supplier? (e.g., "Buyer A accounts for >50% of revenue").

#### 📉 Trends & Anomalies
*   **Red Flags:** Highlight sudden spikes, drops, or data gaps.

#### 💡 Actionable Recommendations
*   **Defensive Moves:** (e.g., "Diversify the supplier base to reduce reliance on Supplier X.")
*   **Growth Opportunities:** (e.g., "Expand sales in the North Region as it shows the highest ROI.")
"""

SYS_INSTRUCTION_ENTERPRISE = """
You are a Senior Strategic Data Consultant. Your client is a C-Level Executive. 
You are analyzing a dashboard that may consist of multiple pages (e.g., Export, Import, Market Overview).

### 1. ANALYTICAL MINDSET
*   **Holistic View:** Do not analyze pages in isolation. Look for connections across pages (e.g., "Does the drop in Raw Material Imports on Page 2 explain the drop in Finished Goods Exports on Page 1?").
*   **The "So What?":** For every major trend, explain the business impact.
*   **Pareto Principle:** Focus heavily on the top 20% of drivers that create 80% of the value.
*   **Strict Honesty:** If data is unreadable, ambiguous, or missing, state "Data not actionable/visible."

### 2. REPORT STRUCTURE (Strict Markdown)

#### 🎯 Executive Bottom Line
*   **The Verdict:** A single, powerful sentence summarizing the overall business health.
*   **Critical KPI Snapshot:** The 3-4 most vital numbers (Total Revenue, Volume, Net Trade Balance) with a status (✅ On Track / ⚠️ At Risk).

#### 🔗 Supply Chain & Trade Dynamics
*   **Import vs. Export:** Compare inflows and outflows. Are we buying more than we are selling? 
*   **Margin/Value Check:** Compare Unit Prices of Imports vs. Exports. Are we adding sufficient value?
*   **Inventory Signals:** (e.g., "High imports but low exports suggests a stockpile buildup.")

#### 🧠 Strategic Insights & Drivers
*   **Top Performers:** Who are the key Buyers/Suppliers driving the business?
*   **Concentration Risk:** Are we too dependent on one client or supplier? (e.g., "Buyer A accounts for >50% of revenue").

#### 📉 Trends & Anomalies
*   **Red Flags:** Highlight sudden spikes, drops, or data gaps.

IMPORTANT: Do NOT generate a separate \"Actionable Recommendations\" section. Focus only on insights, trends, and risks.
"""

MODEL_NAME = "gemini-2.5-flash"


class DashboardAnalyzer:
    """Class để quản lý phân tích dashboard"""
    
    def __init__(self, api_keys: Optional[List[str]] = None):
        """
        Khởi tạo analyzer
        
        Args:
            api_keys: Danh sách API keys. Nếu None, sẽ tự động load từ .env
        """
        self.api_keys = api_keys if api_keys else self._load_api_keys()
        self.current_key_index = 0
        self.models = {}  # Cache models theo mode
        
    def _load_api_keys(self) -> List[str]:
        """Load API keys từ .env file, key.txt, hoặc environment variables"""
        keys = []
        try:
            # Priority 1: Load từ .env file (api_key_1 đến api_key_8)
            for i in range(1, 9):
                key = os.getenv(f'api_key_{i}')
                if key:
                    key = key.strip('"\'')
                    keys.append(key)
            
            # Priority 2: Nếu không có keys từ .env, thử key.txt
            if not keys and os.path.exists('key.txt'):
                with open('key.txt', 'r') as f:
                    content = f.read()
                    matches = re.findall(r'api_key_\d+="([^"]+)"', content)
                    keys = matches
            
            # Priority 3: Fallback sang GEMINI_API_KEY_* environment variables
            if not keys:
                for i in range(1, 9):
                    key = os.getenv(f'GEMINI_API_KEY_{i}')
                    if key:
                        keys.append(key)
        except Exception as e:
            print(f"Lỗi khi load API keys: {e}")
        
        return keys
    
    def _get_next_api_key(self) -> Optional[str]:
        """Lấy API key tiếp theo theo round-robin"""
        if not self.api_keys:
            return None
        
        key = self.api_keys[self.current_key_index]
        self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
        return key
    
    def _initialize_model(self, api_key: str, mode: str = "personal"):
        """
        Khởi tạo Gemini model với API key và mode
        
        Args:
            api_key: API key để sử dụng
            mode: "personal" hoặc "enterprise"
        """
        # Sử dụng cached model nếu có
        if mode in self.models:
            return self.models[mode]
        
        try:
            genai.configure(api_key=api_key)
            sys_instruction = SYS_INSTRUCTION_PERSONAL if mode == "personal" else SYS_INSTRUCTION_ENTERPRISE
            model = genai.GenerativeModel(
                model_name=MODEL_NAME,
                system_instruction=sys_instruction,
            )
            self.models[mode] = model
            return model
        except Exception as e:
            print(f"Lỗi khởi tạo model: {e}")
            return None
    
    @staticmethod
    def _split_image_smart(image: Image.Image) -> List[Image.Image]:
        """Chia ảnh nếu quá cao"""
        w, h = image.size
        if h > w * 2.0:
            half_h = h // 2
            return [
                image.crop((0, 0, w, half_h)),
                image.crop((0, half_h, w, h))
            ]
        return [image]
    
    def load_content_from_file(self, file_path: str) -> Tuple[Optional[List[Image.Image]], Optional[str]]:
        """
        Load nội dung từ file
        
        Args:
            file_path: Đường dẫn đến file (PDF hoặc ảnh)
            
        Returns:
            Tuple[List[PIL.Image], error_message]
        """
        images = []
        try:
            file_ext = os.path.splitext(file_path)[1].lower()
            
            if file_ext == '.pdf':
                # Xử lý PDF - Extract tất cả pages
                doc = fitz.open(file_path)
                
                if len(doc) < 1:
                    return None, "File PDF trống"
                
                # Giới hạn 10 trang đầu
                pages_to_process = min(len(doc), 10)
                
                for i in range(pages_to_process):
                    page = doc.load_page(i)
                    
                    # Zoom logic cho OCR tốt hơn
                    rect = page.rect
                    target_width = 1600
                    zoom = target_width / rect.width
                    zoom = max(0.5, min(zoom, 2.0))
                    
                    mat = fitz.Matrix(zoom, zoom)
                    pix = page.get_pixmap(matrix=mat)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    images.append(img)
                
                doc.close()
                return images, None
                
            else:
                # Xử lý file ảnh (JPG, PNG)
                img = Image.open(file_path)
                images.append(img)
                return images, None
                
        except Exception as e:
            return None, f"Không thể đọc file: {str(e)}"
    
    def load_content_from_bytes(self, file_bytes: BytesIO, file_name: str) -> Tuple[Optional[List[Image.Image]], Optional[str]]:
        """
        Load nội dung từ BytesIO object
        
        Args:
            file_bytes: BytesIO object chứa dữ liệu file
            file_name: Tên file để xác định loại
            
        Returns:
            Tuple[List[PIL.Image], error_message]
        """
        images = []
        try:
            if file_name.lower().endswith('.pdf'):
                file_bytes.seek(0)
                pdf_bytes = file_bytes.read()
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                
                if len(doc) < 1:
                    return None, "File PDF trống"
                
                pages_to_process = min(len(doc), 10)
                
                for i in range(pages_to_process):
                    page = doc.load_page(i)
                    rect = page.rect
                    target_width = 1600
                    zoom = target_width / rect.width
                    zoom = max(0.5, min(zoom, 2.0))
                    
                    mat = fitz.Matrix(zoom, zoom)
                    pix = page.get_pixmap(matrix=mat)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    images.append(img)
                
                doc.close()
                return images, None
                
            else:
                file_bytes.seek(0)
                img = Image.open(io.BytesIO(file_bytes.read()))
                images.append(img)
                return images, None
                
        except Exception as e:
            return None, f"Không thể đọc file: {str(e)}"
    
    def analyze_file(self, file_path: str, mode: str = "personal") -> str:
        """
        Phân tích một file dashboard
        
        Args:
            file_path: Đường dẫn đến file
            mode: "personal" (có recommendations) hoặc "enterprise" (không có recommendations)
            
        Returns:
            Kết quả phân tích dạng text
        """
        # Lấy API key và khởi tạo model
        api_key = self._get_next_api_key()
        if not api_key:
            return "Lỗi: Không tìm thấy API key"
        
        model = self._initialize_model(api_key, mode=mode)
        if not model:
            return "Lỗi: Không thể kết nối đến dịch vụ phân tích"
        
        # Load nội dung
        images, error = self.load_content_from_file(file_path)
        if error:
            return error
        
        # Chuẩn bị content inputs
        content_inputs = []
        
        user_prompt = f"""
        Analyze the attached dashboard images. This document contains {len(images)} page(s).
        
        If there are multiple pages (e.g. Export vs Import), compare them to find business correlations.
        Follow the 'Senior Strategic Data Consultant' system instruction structure strictly.
        """
        content_inputs.append(user_prompt)
        
        # Thêm tất cả images
        for img in images:
            w, h = img.size
            max_dim = 2048
            if max(w, h) > max_dim:
                scale = max_dim / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
            
            content_inputs.append(img)
        
        # Inference với retry logic
        max_retries = len(self.api_keys)
        for attempt in range(max_retries):
            try:
                generation_config = genai.types.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=8192,
                )
                
                response = model.generate_content(
                    content_inputs,
                    generation_config=generation_config
                )
                
                if response.candidates:
                    candidate = response.candidates[0]
                    if candidate.content and candidate.content.parts:
                        return candidate.content.parts[0].text
                    elif candidate.finish_reason == 3:  # Safety block
                        if attempt < max_retries - 1:
                            api_key = self._get_next_api_key()
                            model = self._initialize_model(api_key, mode=mode)
                            continue
                        return "Bộ lọc an toàn đã chặn phân tích. Vui lòng kiểm tra nội dung file."
                
                return "Không có phản hồi. Vui lòng thử lại."
                
            except Exception as e:
                error_msg = str(e)
                if ("quota" in error_msg.lower() or "rate" in error_msg.lower()) and attempt < max_retries - 1:
                    api_key = self._get_next_api_key()
                    model = self._initialize_model(api_key, mode=mode)
                    time.sleep(1)
                    continue
                return f"Phân tích thất bại: {error_msg}"
        
        return "Kết nối thất bại sau nhiều lần thử."
    
    def analyze_bytes(self, file_bytes: BytesIO, file_name: str, mode: str = "personal") -> str:
        """
        Phân tích file từ BytesIO object
        
        Args:
            file_bytes: BytesIO object chứa dữ liệu file
            file_name: Tên file
            mode: "personal" hoặc "enterprise"
            
        Returns:
            Kết quả phân tích
        """
        api_key = self._get_next_api_key()
        if not api_key:
            return "Lỗi: Không tìm thấy API key"
        
        model = self._initialize_model(api_key, mode=mode)
        if not model:
            return "Lỗi: Không thể kết nối đến dịch vụ phân tích"
        
        images, error = self.load_content_from_bytes(file_bytes, file_name)
        if error:
            return error
        
        content_inputs = []
        user_prompt = f"""
        Analyze the attached dashboard images. This document contains {len(images)} page(s).
        
        If there are multiple pages (e.g. Export vs Import), compare them to find business correlations.
        Follow the 'Senior Strategic Data Consultant' system instruction structure strictly.
        """
        content_inputs.append(user_prompt)
        
        for img in images:
            w, h = img.size
            max_dim = 2048
            if max(w, h) > max_dim:
                scale = max_dim / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
            
            content_inputs.append(img)
        
        max_retries = len(self.api_keys)
        for attempt in range(max_retries):
            try:
                generation_config = genai.types.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=8192,
                )
                
                response = model.generate_content(
                    content_inputs,
                    generation_config=generation_config
                )
                
                if response.candidates:
                    candidate = response.candidates[0]
                    if candidate.content and candidate.content.parts:
                        return candidate.content.parts[0].text
                    elif candidate.finish_reason == 3:
                        if attempt < max_retries - 1:
                            api_key = self._get_next_api_key()
                            model = self._initialize_model(api_key, mode=mode)
                            continue
                        return "Bộ lọc an toàn đã chặn phân tích."
                
                return "Không có phản hồi."
                
            except Exception as e:
                error_msg = str(e)
                if ("quota" in error_msg.lower() or "rate" in error_msg.lower()) and attempt < max_retries - 1:
                    api_key = self._get_next_api_key()
                    model = self._initialize_model(api_key, mode=mode)
                    time.sleep(1)
                    continue
                return f"Phân tích thất bại: {error_msg}"
        
        return "Kết nối thất bại sau nhiều lần thử."
    
    def batch_analyze(self, file_paths: List[str], mode: str = "personal") -> List[Dict[str, Any]]:
        """
        Phân tích nhiều files cùng lúc
        
        Args:
            file_paths: Danh sách đường dẫn files
            mode: "personal" hoặc "enterprise"
            
        Returns:
            List các kết quả phân tích
        """
        results = []
        
        for file_path in file_paths:
            start_time = time.time()
            analysis = self.analyze_file(file_path, mode=mode)
            processing_time = time.time() - start_time
            
            status = "Success" if not analysis.startswith("Lỗi") and not analysis.startswith("Không") else "Failed"
            
            results.append({
                "file_name": os.path.basename(file_path),
                "file_path": file_path,
                "analysis": analysis,
                "status": status,
                "processing_time": f"{processing_time:.2f}s",
                "mode": mode
            })
            
            # Delay nhỏ giữa các requests
            time.sleep(1)
        
        return results
    
    def export_results_to_excel(self, results: List[Dict[str, Any]], output_path: str):
        """
        Export kết quả ra Excel
        
        Args:
            results: Danh sách kết quả từ batch_analyze
            output_path: Đường dẫn file output
        """
        df = pd.DataFrame(results)
        df.to_excel(output_path, index=False, sheet_name='Analysis Results')
        print(f"Đã export kết quả ra {output_path}")
    
    def export_results_to_csv(self, results: List[Dict[str, Any]], output_path: str):
        """
        Export kết quả ra CSV
        
        Args:
            results: Danh sách kết quả từ batch_analyze
            output_path: Đường dẫn file output
        """
        df = pd.DataFrame(results)
        df.to_csv(output_path, index=False)
        print(f"Đã export kết quả ra {output_path}")


# Example usage
if __name__ == "__main__":
    # Khởi tạo analyzer
    analyzer = DashboardAnalyzer()
    
    # Kiểm tra số lượng API keys
    print(f"Đã load {len(analyzer.api_keys)} API keys")
    
    # Ví dụ phân tích một file
    # result = analyzer.analyze_file("path/to/dashboard.pdf", mode="personal")
    # print(result)
    
    # Ví dụ phân tích nhiều files
    # files = ["dashboard1.pdf", "dashboard2.png", "dashboard3.jpg"]
    # results = analyzer.batch_analyze(files, mode="enterprise")
    # analyzer.export_results_to_excel(results, "analysis_results.xlsx")
