// File: functions/api_matrix.js
export const config = {
  regions: ["iad", "ewr", "lhr", "fra"] // US-East, US-Newark, London, Frankfurt
};
export async function onRequest(context) {
    const { request, env } = context;
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    if (request.method === "POST") {
        try {
            const apiKey = env.GOOGLE_API_KEY;
            if (!apiKey) throw new Error("Thiếu API Key");

            const MODEL_NAME = "gemini-2.0-flash-exp";
            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:streamGenerateContent?alt=sse&key=${apiKey}`;

            const body = await request.json();
            const { 
                license_key, topics, subject, grade, semester, 
                exam_type, time, use_short_answer, 
                totalPeriodsHalf1, totalPeriodsHalf2,
                book_series 
            } = body;
            
            // --- 1. CHECK LICENSE ---
            if (env.TEST_TOOL && license_key) { 
                const creditStr = await env.TEST_TOOL.get(license_key); 
                if (!creditStr || parseInt(creditStr) <= 0) {
                    return new Response(JSON.stringify({ error: "License không hợp lệ hoặc hết hạn!" }), { status: 403, headers: corsHeaders });
                }
            }

            // --- 2. XỬ LÝ MÔ TẢ CHỦ ĐỀ ---
            // Thêm chỉ dẫn rõ ràng về trọng số thời gian cho AI
            let topicsDescription = "";
            topics.forEach((topic, index) => {
                topicsDescription += `\nCHƯƠNG ${index + 1}: ${topic.name}\n`;
                topic.units.forEach((unit, uIndex) => {
                    let periodInfo = "";
                    let weightNote = "";
                    if (exam_type === 'hk') {
                        // Logic phân bổ 25/75 cho Cuối kỳ
                        if (unit.p2 > 0) { // Giả định bài có tiết ở HK2 là kiến thức mới
                             periodInfo = ` [Thời lượng: ${unit.p2} tiết (Nửa sau HK - TRỌNG TÂM 75%)]`;
                             weightNote = " (Ưu tiên ra nhiều câu hỏi)";
                        } else {
                             periodInfo = ` [Thời lượng: ${unit.p1} tiết (Nửa đầu HK - ÔN TẬP 25%)]`;
                             weightNote = " (Ra ít câu hỏi)";
                        }
                    } else {
                        periodInfo = ` [Thời lượng: ${unit.p1} tiết]`;
                    }
                    topicsDescription += `   - Bài ${uIndex + 1}: ${unit.content}${periodInfo}${weightNote}\n`;
                });
            });
           
            // --- 3. XÂY DỰNG CẤU TRÚC ĐỀ THI ---
            let structurePrompt = "";
            
            if (use_short_answer) {
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (3 PHẦN):
                - Phần I: Trắc nghiệm nhiều lựa chọn (4 phương án chọn 1).
                - Phần II: Trắc nghiệm Đúng/Sai (Mỗi câu có 4 ý a,b,c,d).
                - Phần III: Câu hỏi Trả lời ngắn (Điền đáp số/kết quả).
                `;
            } else {
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (2 PHẦN):
                - Phần I: Trắc nghiệm khách quan (4 lựa chọn).
                - Phần II: Tự luận (Giải chi tiết).
                *** YÊU CẦU ĐẶC BIỆT: TUYỆT ĐỐI KHÔNG SOẠN CÂU HỎI DẠNG "TRẢ LỜI NGẮN" HAY "ĐIỀN ĐÁP SỐ". CHỈ DÙNG TRẮC NGHIỆM VÀ TỰ LUẬN. ***
                `;
            }

            // --- 4. LOGIC PHÂN BỐ ĐIỂM ---
            let scoreLogic = "";
            if (exam_type === 'hk') {
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (CUỐI KÌ): Tổng tiết Nửa đầu HK: ${totalPeriodsHalf1}, Nửa sau HK: ${totalPeriodsHalf2}. BẮT BUỘC phân bổ điểm: Kiến thức Nửa đầu ~20-30%, Kiến thức Nửa sau ~70-80%.`;
            } else {
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (GIỮA KÌ): Tổng số tiết: ${totalPeriodsHalf1}. Tính % điểm tỷ lệ thuận với số tiết từng bài.`;
            }

            // --- PROMPT FINAL (ĐÃ CƯỜNG HÓA LOGIC TƯ DUY) ---
            const prompt = `
            Bạn là một trợ lý chuyên gia khảo thí hàng đầu. Nhiệm vụ của bạn là xây dựng Ma trận, Đặc tả và Đề kiểm tra chính xác tuyệt đối theo Công văn 7991/BGDĐT-GDTrH.

            ### BƯỚC 1: TIẾP NHẬN DỮ LIỆU ĐẦU VÀO
            1. Môn: ${subject} - Lớp ${grade}
            2. Bộ sách: **${book_series}** (BẮT BUỘC: Chỉ sử dụng kiến thức/thuật ngữ của sách này).
            3. Kỳ thi: ${exam_type === 'hk' ? 'Cuối học kì' : 'Giữa học kì'} ${semester}.
            4. Thời gian: ${time} phút.
            5. Cấu trúc đề thi:
            ${structurePrompt}
            6. Nội dung kiến thức và thời lượng:
            ${topicsDescription}
            ${scoreLogic}

            ### BƯỚC 2: TƯ DUY PHÂN BỔ SỐ LƯỢNG CÂU HỎI (LOGIC MÁY TÍNH)
            Trước khi viết bảng, bạn phải tính toán "Quota" số lượng câu hỏi. BẮT BUỘC tuân thủ số lượng sau dựa trên thời gian **${time} phút**:

            * **TRƯỜNG HỢP A: Nếu thời gian >= 60 phút**
              - Tổng số câu MCQ (Phần I): **12 câu** (0.25đ/câu).
              - Tổng số câu Đúng/Sai (Phần II): **2 câu** (4.0đ).
              - Tổng số câu Trả lời ngắn/Tự luận (Phần III/IV):
                + Nếu có Trả lời ngắn: **4 câu TLN** (2.0đ) + **1-2 câu Tự luận** (1.0đ).
                + Nếu KHÔNG có Trả lời ngắn: **2-3 câu Tự luận** (3.0đ).

            * **TRƯỜNG HỢP B: Nếu thời gian <= 45 phút**
              - Tổng số câu MCQ (Phần I): **6 câu** (0.5đ/câu).
              - Tổng số câu Đúng/Sai (Phần II): **1 câu** (4.0đ).
              - Tổng số câu Trả lời ngắn/Tự luận (Phần III/IV):
                + Nếu có Trả lời ngắn: **4 câu TLN** (2.0đ) + **1 câu Tự luận** (1.0đ).
                + Nếu KHÔNG có Trả lời ngắn: **1-2 câu Tự luận** (3.0đ).

            **QUY TẮC ĐIỀN DỮ LIỆU VÀO MA TRẬN (KHÔNG ĐƯỢC SAI):**
            1. **Nguyên tắc Phủ kín:** KHÔNG được bỏ sót bất kỳ bài học nào trong danh sách. Bài nào quan trọng/nhiều tiết (đặc biệt là kiến thức Nửa sau HK) phải có nhiều câu hỏi hơn.
            2. **Nguyên tắc Rải mức độ:**
               - MCQ: Phải có cả mức Biết và Hiểu.
               - Đúng/Sai: Phải có mức Hiểu và Vận dụng.
               - Tự luận/TLN: Phải có mức Vận dụng. **TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG CỘT VẬN DỤNG.**
            3. **Kiểm tra tổng:** Tổng số câu hỏi dọc theo cột của từng loại (MCQ, Đ/S, TLN, TL) phải khớp chính xác với con số "Quota" đã tính ở trên.

            ### BƯỚC 3: XUẤT DỮ LIỆU ĐẦU RA (HTML OUTPUT)
            *Yêu cầu:* Chỉ trả về mã HTML. Sử dụng thẻ <table> chuẩn.

            **1. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ**
            *Copy chính xác cấu trúc Header này và điền dữ liệu vào Body:*
            \`\`\`html
            <table border="1" style="border-collapse:collapse; width:100%; text-align:center;">
                <thead>
                    <tr>
                        <th rowspan="4">TT</th>
                        <th rowspan="4">Chủ đề/Chương</th>
                        <th rowspan="4">Nội dung/Đơn vị kiến thức</th>
                        <th colspan="12">Mức độ đánh giá</th>
                        <th colspan="3">Tổng số câu</th>
                        <th rowspan="4">Tỉ lệ % điểm</th>
                    </tr>
                    <tr>
                        <th colspan="3">TNKQ (MCQ)</th>
                        <th colspan="3">Đúng/Sai (T/F)</th>
                        <th colspan="3">Trả lời ngắn (SA)</th>
                        <th colspan="3">Tự luận (TL)</th>
                        <th rowspan="3">MCQ</th>
                        <th rowspan="3">Đ/S</th>
                        <th rowspan="3">Khác</th>
                    </tr>
                    <tr>
                        <th colspan="3">Số câu</th>
                        <th colspan="3">Số câu</th>
                        <th colspan="3">Số câu</th>
                        <th colspan="3">Số câu</th>
                    </tr>
                    <tr>
                        <th>B</th><th>H</th><th>VD</th>
                        <th>B</th><th>H</th><th>VD</th>
                        <th>B</th><th>H</th><th>VD</th>
                        <th>B</th><th>H</th><th>VD</th>
                    </tr>
                </thead>
                <tbody>
                    </tbody>
                <tfoot>
                    <tr>
                        <th colspan="3">TỔNG SỐ CÂU</th>
                        <th>...</th><th>...</th><th>...</th>
                        <th>...</th><th>...</th><th>...</th>
                        <th>...</th><th>...</th><th>...</th>
                        <th>...</th><th>...</th><th>...</th>
                        <th>12 (hoặc 6)</th>
                        <th>2 (hoặc 1)</th>
                        <th>...</th>
                        <th>100%</th>
                    </tr>
                     <tr>
                        <th colspan="3">TỔNG ĐIỂM</th>
                        <th colspan="15">10.0 ĐIỂM</th>
                        <th></th>
                    </tr>
                </tfoot>
            </table>
            \`\`\`

            **2. BẢN ĐẶC TẢ ĐỀ KIỂM TRA**
            (Tạo bảng HTML 16 cột theo mẫu Phụ lục. Cột "Yêu cầu cần đạt" phải mô tả chi tiết: Biết..., Hiểu..., Vận dụng...).

            **3. ĐỀ KIỂM TRA**
            - Tiêu đề: ĐỀ KIỂM TRA ${exam_type === 'hk' ? 'CUỐI' : 'GIỮA'} HỌC KÌ ${semester} - MÔN ${subject.toUpperCase()} ${grade}
            - **Cấu trúc:**
              I. TRẮC NGHIỆM (7.0 điểm)
                 1. Trắc nghiệm nhiều lựa chọn (Các câu 1, 2...)
                 2. Trắc nghiệm Đúng/Sai (Các câu 1, 2...)
                 3. Trắc nghiệm Trả lời ngắn (Các câu 1, 2...) [Nếu có]
              II. TỰ LUẬN (3.0 điểm)
                 (Các câu bài tập tự luận)
            - **Lưu ý định dạng:**
              + Đáp án MCQ: Xuống dòng A, B, C, D (dùng <br>).
              + Câu chùm Đúng/Sai: Liệt kê a), b), c), d).
              + Toán học: Dùng LaTeX $$...$$.

            **4. HƯỚNG DẪN CHẤM**
            - Đáp án chi tiết và thang điểm.

            ### TÀI LIỆU THAM KHẢO (ĐỂ TUÂN THỦ LUẬT):
            ${DOCUMENT_CONTENT_7991}

           ## YÊU CẦU ĐẶC BIỆT VỀ NGUỒN KIẾN THỨC (TUÂN THỦ TUYỆT ĐỐI):
            1. **Đúng Bộ Sách & Chương Trình:** Dựa vào tên môn học ${subject} và nội dung chi tiết được cung cấp, hãy xác định chính xác bộ sách giáo khoa (Kết nối tri thức, Chân trời sáng tạo, hoặc Cánh diều) để ra câu hỏi phù hợp với thuật ngữ và kiến thức của bộ sách đó.
            2. **Đúng Lớp: Bạn đang ra đề cho LỚP ${grade}.
               - Tuyệt đối KHÔNG lấy nhầm kiến thức của lớp khác (Ví dụ: Nếu là Lớp 9 thì không được dùng kiến thức Lớp 8).
               - Kiểm tra kỹ các đơn vị kiến thức, công thức, định nghĩa phải thuộc đúng phạm vi chương trình Lớp ${grade}.
            3. **Nguyên tắc "Chỉ Dữ Liệu Được Cung Cấp" (Source-Only):**
               - Tuyệt đối KHÔNG sử dụng kiến thức bên ngoài (Pre-trained knowledge) nếu nó mâu thuẫn hoặc không được nhắc đến trong phần "DỮ LIỆU NỘI DUNG" ở trên.
               - Ví dụ: Nếu người dùng nhập "Tin học 9: Giải quyết vấn đề" mà không nhắc đến Python, bạn **KHÔNG ĐƯỢC PHÉP** ra câu hỏi về Python.
               - Nếu người dùng nhập "Hóa học: Base" mà không liệt kê tên chất cụ thể, hãy chỉ ra câu hỏi về tính chất chung, không tự bịa ra các chất lạ không có trong chương trình phổ thông.
            4. **Đối với các môn đặc thù (Tin học, Ngoại ngữ):**
               - "Tin học cấp THCS":Chỉ ra câu hỏi về ngôn ngữ lập trình Scratch, thuật toán liên quan đến Scratch hoặc phần mềm **được nêu tên cụ thể** trong phần nội dung đầu vào. Nếu người dùng không ghi tên ngôn ngữ (ví dụ chỉ ghi "Lập trình"), hãy ra câu hỏi tư duy thuật toán chung (Lưu đồ, giả mã) chứ không dùng code cụ thể (như Python/C++).
               - "Tin học cấp THPT":Chỉ ra câu hỏi về ngôn ngữ lập trình Python, thuật toán liên quan đến Python hoặc phần mềm **được nêu tên cụ thể** trong phần nội dung đầu vào. 
               - "Tiếng Anh": Chỉ sử dụng ngữ pháp/từ vựng phù hợp với trình độ lớp ${grade}.
        
          ## KẾT QUẢ ĐẦU RA: TUÂN THỦ NGIÊM NGẶT CÁC YÊU CẦU SAU:

 **I. QUY ĐỊNH VỀ ĐIỂM SỐ VÀ CẤU TRÚC ĐỀ (QUAN TRỌNG - BẮT BUỘC):**
            *Mục tiêu: Đảm bảo TỔNG ĐIỂM TOÀN BÀI LUÔN LÀ 10.0.*

            1. **Phân bổ tỉ lệ điểm theo nội dung kiến thức:**
               - **Đề giữa kỳ:** Tỉ lệ điểm của mỗi đơn vị = (Số tiết của đơn vị / Tổng số tiết toàn bộ nội dung) * 100%.
               - **Đề học kỳ:**
                 - Nửa đầu học kỳ (chiếm khoảng 25% trọng số điểm): Tỉ lệ điểm = (Số tiết đơn vị * 0.25) / Tổng tiết nửa đầu.
                 - Nửa sau học kỳ (chiếm khoảng 75% trọng số điểm): Tỉ lệ điểm = (Số tiết đơn vị * 0.75) / Tổng tiết nửa sau.
               - *Lưu ý:* Tổng tỉ lệ % điểm của tất cả các đơn vị cộng lại phải bằng 100%.

            2. **Cấu trúc điểm theo dạng câu hỏi (Cố định theo Công văn 7991):**
               - **Phần I (Trắc nghiệm nhiều lựa chọn - MCQ):** 3.0 điểm (30%).
               - **Phần II (Trắc nghiệm Đúng-Sai):** 4.0 điểm (40%). (Lưu ý: Điểm phần này tính theo thang điểm đặc biệt của câu chùm, nhưng trong bảng ma trận quy ước ghi số lượng câu chùm).
               - **Phần III (Trắc nghiệm Trả lời ngắn):** 3.0 điểm (30%) hoặc **Tự luận** tùy theo đặc thù môn học (nếu đề bài yêu cầu cả tự luận thì phân bổ lại: MCQ 3.0đ, Đúng-Sai 2.0đ, Trả lời ngắn 2.0đ, Tự luận 3.0đ).
               - *Mặc định cấu trúc chung:* TNKQ (7.0 điểm) + Tự luận (3.0 điểm) = 10.0 điểm. (Nếu có sử dụng Tự luận).

            3. **Cấu trúc điểm theo mức độ nhận thức (Cố định):**
               - **Biết:** ~40% (4.0 điểm).
               - **Hiểu:** ~30% (3.0 điểm).
               - **Vận dụng:** ~30% (3.0 điểm).
               - **QUY TẮC PHÂN BỔ QUAN TRỌNG:** Mỗi loại câu hỏi (MCQ, Đúng/Sai, Trả lời ngắn, Tự luận) **PHẢI ĐƯỢC PHÂN BỔ SAO CHO CÓ ĐỦ CẢ 3 MỨC ĐỘ** (Biết, Hiểu, Vận dụng). Không được dồn hết mức độ Vận dụng vào một loại câu hỏi duy nhất. Ví dụ: Câu hỏi MCQ phải có cả câu Biết, câu Hiểu và câu Vận dụng.

            4. **Quy đổi số lượng câu hỏi và Hệ số điểm (Dựa trên thời lượng ${time} phút):**
               *Hệ thống tự động chọn 1 trong 2 trường hợp sau dựa vào thời gian làm bài:*

               **Trường hợp 4.1: Nếu thời gian là 90 phút hoặc 60 phút (${time} >= 60 phút):**
               - **MCQ (0.25đ/câu):** Cần 3.0 điểm => **12 câu**.
               - **Đúng-Sai:** Cần 2.0 điểm => **2 câu chùm** (mỗi câu chùm có 4 ý a,b,c,d; tính điểm theo số ý đúng).
               - **Trả lời ngắn (0.5đ/câu):** Cần 2.0 điểm => **4 câu**.
               - **Tự luận:** Cần 3.0 điểm => **2-3 câu** (phân phối điểm linh hoạt, ví dụ: 1.5đ + 1.0đ + 0.5đ).
               - *Tổng số câu:* Phải khớp với cấu trúc trên.

               **Trường hợp 4.2: Nếu thời gian là 45 phút (${time} <= 45 phút):**
               - **MCQ (0.5đ/câu):** Cần 3.0 điểm => **6 câu**. (Lưu ý hệ số điểm thay đổi thành 0.5đ).
               - **Đúng-Sai:** Cần 2.0 điểm => **1 câu chùm** (mỗi câu chùm có 4 ý a,b,c,d; 0.5đ/ý).
               - **Trả lời ngắn (0.5đ/câu):** Cần 2.0 điểm => **4 câu**.
               - **Tự luận:** Cần 3.0 điểm => **2-3 câu** (phân phối điểm linh hoạt, ví dụ: 1.5đ + 1.0đ + 0.5đ).
               - *Tổng số câu:* Phải khớp với cấu trúc trên.

            **II. YÊU CẦU VỀ ĐỊNH DẠNG VÀ CẤU TRÚC BẢNG (BẮT BUỘC):**

            **A. PHẦN I – MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ**
            *Tạo bảng HTML (thẻ <table>) có đúng 19 cột. Cấu trúc cụ thể:*

            * **HEADER (Dòng 1-4):**
                * **Dòng 1:**
                    * Cột 1 (A): 'rowspan="4"': **TT**
                    * Cột 2 (B): 'rowspan="4"': **Chủ đề/Chương**
                    * Cột 3 (C): 'rowspan="4"': **Nội dung/đơn vị kiến thức**
                    * Cột 4-15 (D-O): 'colspan="12"': **Mức độ đánh giá**
                    * Cột 16-18 (P-R): 'colspan="3"': **Tổng**
                    * Cột 19 (S): 'rowspan="4"': **Tỉ lệ % điểm**
                * **Dòng 2:**
                    * Cột 4-12 (D-L): 'colspan="9"': **TNKQ**
                    * Cột 13-15 (M-O): 'colspan="3"': **Tự luận**
                * **Dòng 3:**
                    * Cột 4-6 (D-F): 'colspan="3"': **Nhiều lựa chọn**
                    * Cột 7-9 (G-I): 'colspan="3"': **Đúng - Sai**
                    * Cột 10-12 (J-L): 'colspan="3"': **Trả lời ngắn**
                    * Cột 13-15 (M-O): 'colspan="3"': **Tự luận**
                * **Dòng 4:**
                    * Các cột con (Biết, Hiểu, Vận dụng) tương ứng cho từng nhóm ở dòng 3.
                    * Cột 16 (P): **Biết**, Cột 17 (Q): **Hiểu**, Cột 18 (R): **Vận dụng**.

            **B. HƯỚNG DẪN ĐIỀN DỮ LIỆU (LOGIC TỰ SINH):**
            * **Bước 1:** Điền tên Chủ đề và Nội dung vào cột 2 và 3.
            * **Bước 2 (Điền số lượng câu):** Phân bổ số câu hỏi vào các ô mức độ (Cột 4-15) dựa trên thời gian làm bài (${time} phút):
                - Tổng số câu MCQ dọc xuống phải bằng **12** (nếu >= 60p) hoặc **6** (nếu <= 45p).
                - Tổng số câu Đúng-Sai dọc xuống phải bằng **2** (nếu >= 60p) hoặc **1** (nếu <= 45p).
                - Tổng số câu Trả lời ngắn dọc xuống phải bằng **4**.
                - Tổng số câu Tự luận dọc xuống phải bằng **2-3**.
				- Tổng số câu ở tất cả các cột dọc xuống từ cột 14 đến cột 15 **phải* > 0. 
            * **Bước 3 (Tính tổng):**
                - Cột 16, 17, 18: Tự động cộng tổng số câu (bất kể loại nào) theo từng mức độ Biết, Hiểu, Vận dụng cho mỗi dòng.
                - Cột 19: Tính tỉ lệ % điểm dựa trên số lượng và loại câu hỏi của dòng đó (Lưu ý hệ số điểm: MCQ=0.25đ hoặc 0.5đ tùy thời gian, TLN=0.5đ, v.v..).
            * **Bước 4 **Tổng kết - ***Footer 3 dòng:**
                - Dòng **Tổng số câu*: * Cột 1-3 (A-C): 'colspan="3"':  Cộng dọc tất cả các cột. (Kết quả mỗi ô phải >0)
                - Dòng **Tổng điểm*: * Cột 1-3 (A-C): 'colspan="3"': Kiểm tra lại tổng điểm toàn bài phải là 10.0.
									 * Cột 4-6 (D-F): 'colspan="3"': **Tự động Cộng điểm phần câu hỏi MQC**
				                     * Cột 7-9 (G-I): 'colspan="3"': **Cộng tổng điểm phần số câu Đúng - Sai**
				                     * Cột 10-12 (J-L): 'colspan="3"': **Cộng tổng điểm phần số câu Trả lời ngắn**
				                     * Cột 13-15 (M-O): 'colspan="3"': **Cộng tổng điểm phần số câu Tự luận**
									 * Cột 16: Tự động cộng điểm phần "Biết"; * **Cột 17: Tự động cộng điểm phần "Hiểu"; * **Cột 18: Tự động cộng điểm phần "Vận dụng"; * Cột 19: Tự động cộng toàn bài; 
                - Dòng **Tỉ lệ %*: * Cột 1-3 (A-C): 'colspan="3"': Tự động cộng Cộng dọc tất cả các cột để ra tổng tỉ lệ % theo từng loại và từng mức độ. Kiểm tra lại tổng tỉ lệ toàn bài phải là 100%.

            **C. PHẦN II – BẢN ĐẶC TẢ ĐỀ KIỂM TRA**
            *Tạo bảng HTML có 16 cột:*
            * Cột 1-3: Giống phần Ma trận.
            * Cột 4: **Yêu cầu cần đạt** (Mô tả chi tiết kiến thức/kỹ năng cần kiểm tra cho từng mức độ Biết/Hiểu/Vận dụng, mỗi ý xuống dòng bằng thẻ '<br>').
            * Cột 5-16: Số câu hỏi ở các mức độ (Copy chính xác số liệu từ các cột D-O ở ma trận xuống).

            **D. PHẦN III – ĐỀ KIỂM TRA & ĐÁP ÁN**
            * **Đề bài:**
                * Phân chia rõ ràng 2 phần: **I. TRẮC NGHIỆM KHÁCH QUAN** (7.0đ) và **II. TỰ LUẬN** (3.0đ).
                * **Phần I:** Chia thành 3 tiểu mục (Số lượng tùy thời gian ${time} phút):
                    * **Phần 1 (MCQ):** 12 câu (>=60p) hoặc 6 câu (<=45p).
                    * **Phần 2 (Đúng-Sai):** 2 câu chùm (>=60p) hoặc 1 câu chùm (<=45p). **Kẻ bảng 2 cột: Nội dung | Đúng/Sai.
                    * **Phần 3 (Trả lời ngắn):** 4 câu.
                * **Phần II:** 2-3 câu tự luận, ghi rõ điểm số từng câu.
                * *Lưu ý:* Mỗi câu hỏi phải có mã ma trận (ví dụ: '[M1-B]' cho Mức 1 - Biết).
            * **Đáp án & Hướng dẫn chấm:**
                * **Phần 1 (MCQ):** Kẻ bảng đáp án (1-A, 2-B...).
                * **Phần 2 (Đúng-Sai):** Kẻ bảng chi tiết cho từng câu chùm (a-Đ, b-S...).
                * **Phần 3 (Trả lời ngắn):** Liệt kê đáp án đúng.
                * **Tự luận:** Kẻ bảng 3 cột (Câu | Nội dung/Đáp án chi tiết | Điểm).

            **III. QUY ĐỊNH KỸ THUẬT (BẮT BUỘC):**
            1. **Định dạng:** Chỉ trả về mã **HTML Table** ('<table border="1">...</table>') cho các bảng.
            2. **Không dùng Markdown:** Tuyệt đối không dùng \`\`\`html\`\`\` hoặc |---| .
            3. **Xuống dòng (QUAN TRỌNG):**
               - Trong HTML, ký tự xuống dòng (\n) không có tác dụng. **BẮT BUỘC phải dùng thẻ '<br>'** để ngắt dòng.
               - Mỗi khi kết thúc một ý, một câu, hoặc một đáp án, phải chèn thẻ '<br>'.
            4. **Công thức Toán:** Sử dụng LaTeX chuẩn, bao quanh bởi dấu $$ (ví dụ: $$x^2 + \sqrt{5}$$). Không dùng MathML.
            5. **Định dạng Trắc nghiệm (MCQ):**
               - Cấu trúc bắt buộc: Nội dung câu hỏi '<br>' A. ... <br> B. ... <br> C. ... <br> D. ...
               - **Tuyệt đối không** viết các đáp án nối liền nhau trên cùng một dòng.
            6. **Định dạng Câu chùm (Đúng/Sai):**
               - Nội dung lệnh hỏi <br>
               - a) Nội dung ý a... <br>
               - b) Nội dung ý b... <br>
               - c) Nội dung ý c... <br>
               - d) Nội dung ý d...
            7. **Khoảng cách giữa các câu:** Giữa Câu 1 và Câu 2 (và các câu tiếp theo) phải có thêm một thẻ '<br>' hoặc dùng thẻ '<p>' bao quanh từng câu để tạo khoảng cách rõ ràng, dễ đọc.
            `;

            // --- 6. GỌI API & STREAMING ---
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Google API Error (${response.status}): ${errText}`);
            }

            // --- 7. XỬ LÝ STREAM ---
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            (async () => {
                const reader = response.body.getReader();
                let buffer = "";
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        buffer += chunk;
                        const lines = buffer.split("\n");
                        buffer = lines.pop();

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                const jsonStr = line.substring(6).trim();
                                if (jsonStr === "[DONE]") continue;
                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                                    if (text) await writer.write(encoder.encode(text));
                                } catch (e) {}
                            }
                        }
                    }
                    if (env.TEST_TOOL && license_key) {
                        const creditStr = await env.TEST_TOOL.get(license_key);
                        if (creditStr) await env.TEST_TOOL.put(license_key, (parseInt(creditStr) - 1).toString());
                    }
                } catch (e) {
                    await writer.write(encoder.encode(`[LỖI]: ${e.message}`));
                } finally {
                    await writer.close();
                }
            })();

            return new Response(readable, {
                headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: `System Error: ${error.message}` }), { status: 500, headers: corsHeaders });
        }
    }
}

// --- BIẾN DOCUMENT_CONTENT_7991 (NỘI DUNG GỐC) ---
const DOCUMENT_CONTENT_7991 = `
BỘ GIÁO DỤC VÀ ĐÀO TẠO
CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM

Độc lập - Tự do - Hạnh phúc

Số: 7991/BGDĐT-GDTrH
V/v thực hiện kiểm tra, đánh giá đối với cấp THCS, THPT
Hà Nội, ngày 17 tháng 12 năm 2024

Kính gửi: Các Sở Giáo dục và Đào tạo

Để thực hiện việc kiểm tra, đánh giá theo quy định tại Thông tư số 22/2021/TT-BGDĐT ngày 20/7/2021 quy định về đánh giá học sinh trung học cơ sở và học sinh trung học phổ thông của Bộ trưởng Bộ Giáo dục và Đào tạo (GDĐT), Bộ GDĐT đề nghị các Sở GDĐT căn cứ nội dung đã được tập huấn cho giáo viên cốt cán vào tháng 11/2024(1), tổ chức tập huấn cho cán bộ quản lí, giáo viên của các cơ sở giáo dục có thực hiện chương trình giáo dục phổ thông trên địa bàn quản lí.

Đối với các môn học đánh giá bằng nhận xét kết hợp đánh giá bằng điểm số, Sở GDĐT hướng dẫn các cơ sở giáo dục ở cấp trung học phổ thông xây dựng ma trận, bản đặc tả, đề kiểm tra và hướng dẫn chấm đề kiểm tra định kì bảo đảm các yêu cầu về chuyên môn, kĩ thuật (tham khảo Phụ lục kèm theo); trong năm học 2024-2025 triển khai thực hiện từ học kì 2.

Trong quá trình thực hiện, nếu có vướng mắc, đề nghị Sở GDĐT phản ánh về Bộ GDĐT (qua Vụ Giáo dục Trung học).

Nơi nhận

Như trên;

Bộ trưởng (để báo cáo);

TT. Phạm Ngọc Thưởng (để báo cáo);

Vụ trưởng (để báo cáo);

Lưu: VT, Vụ GDTrH.

TL. BỘ TRƯỞNG
KT. VỤ TRƯỞNG VỤ GIÁO DỤC TRUNG HỌC
PHÓ VỤ TRƯỞNG

(đã ký)
Đỗ Đức Quế

(1) Công văn số 6569/BGDĐT-GDTrH ngày 16/10/2024 về việc tập huấn giáo viên cốt cán về tăng cường năng lực thực hiện CT GDPT 2018 của Bộ GDĐT.

📎 PHỤ LỤC

(Kèm theo Công văn số 7991/BGDĐT-GDTrH ngày 17/12/2024 của Bộ GDĐT)
1. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ
| TT | Chủ đề/Chương | Nội dung/ĐV kiến thức | TNKQ – Nhiều lựa chọn | TNKQ – Đúng/Sai | TNKQ – Trả lời ngắn | Tự luận | Tổng | Tỉ lệ % |
|----|----------------|------------------------|------------------------|------------------|----------------------|----------|--------|----------|
| 1 | Chủ đề 1 | | Biết / Hiểu / VD | Biết / Hiểu / VD | Biết / Hiểu / VD | Biết / Hiểu / VD | (n) |    |
| 2 | Chủ đề 2 | | | | | | | |
| … | Chủ đề … | | | | | | | |

**Tổng số câu:** **Tổng số điểm:** 3.0 – 2.0 – 2.0 – 3.0 – 4.0 – 3.0 – 3.0  
**Tỉ lệ %:** 30 – 20 – 20 – 30 – 40 – 30 – 30
Ghi chú

(2) Mỗi câu hỏi Đúng – Sai gồm 4 ý nhỏ.

(3) Nếu môn không dùng dạng “Trả lời ngắn” → chuyển điểm sang Đúng – Sai.

(4) “n” = số câu.

(5) Phân phối điểm để đạt tỉ lệ khoảng 30%.
2. BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ
| TT | Chủ đề/Chương | Đơn vị kiến thức | Yêu cầu cần đạt | Số câu TNKQ | Số câu tự luận |
|----|----------------|------------------|------------------|--------------|-----------------|
| 1 | Chủ đề 1 | - Biết…  |  | (n) / NL? |  |
|   |              | - Hiểu… |  |            |  |
|   |              | - Vận dụng… | |            |  |
| 2 | Chủ đề 2 | - Biết… | | | |
| … | Chủ đề … | | | | |

**Tổng số câu:** **Tổng số điểm:** 3.0 – 2.0 – 2.0 – 3.0  
**Tỉ lệ %:** 30 – 20 – 20 – 30
Ghi chú

(6) “NL” là ghi tắt tên năng lực theo chương trình môn học.
`;
