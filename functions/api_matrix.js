// File: functions/api_matrix.js
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

            const MODEL_NAME = "gemini-3-pro-preview";
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
            let topicsDescription = "";
            topics.forEach((topic, index) => {
                topicsDescription += `\nCHƯƠNG ${index + 1}: ${topic.name}\n`;
                topic.units.forEach((unit, uIndex) => {
                    let periodInfo = "";
                    if (exam_type === 'hk') {
                        periodInfo = ` [Thời lượng: ${unit.p1} tiết (Nửa đầu), ${unit.p2} tiết (Nửa sau)]`;
                    } else {
                        periodInfo = ` [Thời lượng: ${unit.p1} tiết]`;
                    }
                    topicsDescription += `   - Bài ${uIndex + 1}: ${unit.content}${periodInfo}\n`;
                });
            });
           
            // --- 3. XÂY DỰNG CẤU TRÚC ĐỀ THI DỰA TRÊN LỰA CHỌN (FIX LỖI) ---
            let structurePrompt = "";
            
            if (use_short_answer) {
                // Cấu trúc mới 2025 (Có trả lời ngắn)
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (3 PHẦN):
                - Phần I: Trắc nghiệm nhiều lựa chọn (4 phương án chọn 1).
                - Phần II: Trắc nghiệm Đúng/Sai (Mỗi câu có 4 ý a,b,c,d).
                - Phần III: Câu hỏi Trả lời ngắn (Điền đáp số/kết quả).
                `;
            } else {
                // Cấu trúc truyền thống (Không có trả lời ngắn)
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
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (CUỐI KÌ): Tổng tiết Nửa đầu HK: ${totalPeriodsHalf1}, Nửa sau HK: ${totalPeriodsHalf2}. Phân bổ điểm tỷ lệ thuận với thời lượng.`;
            } else {
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (GIỮA KÌ): Tổng số tiết: ${totalPeriodsHalf1}. Tính % điểm dựa trên số tiết từng bài.`;
            }

            // --- PROMPT FINAL ---
            const prompt = `
            Bạn là một trợ lý chuyên về xây dựng ma trận đề kiểm tra và đề kiểm tra theo quy định của Bộ Giáo dục và Đào tạo Việt Nam. Dựa trên Công văn số 7991/BGDĐT-GDTrH ngày 17/12/2024 và các hướng dẫn trong Phụ lục kèm theo. Bạn am hiểu sâu sắc chương trình giáo dục phổ thông 2018 (Ban hành kèm theo Thông tư số 32/2018/TT-BGDĐT ngày 26 tháng 12 năm 2018 của Bộ trưởng Bộ Giáo dục và Đào tạo).
            Bạn hiểu biết chuyên sâu về sách giáo khoa ${book_series} lớp 6, lớp 7, lớp 8, lớp 9, lớp 10, lớp 11, lớp 12 tham khảo tại địa chỉ "https://taphuan.nxbgd.vn/#/".
            Nhiệm vụ của bạn là xây dựng ma trận đề kiểm tra, bản đặc tả đề kiểm tra, đề kiểm tra và hướng dẫn chấm theo các yêu cầu dưới đây. KHÔNG thêm bất kỳ lời giải thích nào.
           
            ## THÔNG TIN
           1. Môn: ${subject} - Lớp ${grade}
            2. Bộ sách: **${book_series}** (Dùng đúng thuật ngữ sách này).
            3. Kỳ thi: ${exam_type === 'hk' ? 'Cuối học kì' : 'Giữa học kì'} ${semester}.
            4. Thời gian: ${time} phút.

            ${structurePrompt}

            ## NỘI DUNG & THỜI LƯỢNG:
            ${topicsDescription}
            
            ${scoreLogic}
          ## KẾT QUẢ ĐẦU RA: TUÂN THỦ NGIÊM NGẶT CÁC YÊU CẦU SAU:

**I. QUY ĐỊNH VỀ ĐIỂM SỐ VÀ TÍNH TOÁN (QUAN TRỌNG - THỰC HIỆN TRƯỚC):**
*Mục tiêu: Đảm bảo TỔNG ĐIỂM TOÀN BÀI LUÔN LÀ 10.0.*

1. **Phân bổ tỉ lệ điểm theo nội dung kiến thức:**
   - **Đề giữa kỳ:** Tỉ lệ điểm của mỗi đơn vị = (Số tiết của đơn vị / Tổng số tiết toàn bộ nội dung) * 100%.
   - **Đề học kỳ:**
     - Nửa đầu học kỳ (25% điểm): Tỉ lệ điểm đơn vị = (Số tiết đơn vị * 0.25) / Tổng tiết nửa đầu.
     - Nửa sau học kỳ (75% điểm): Tỉ lệ điểm đơn vị = (Số tiết đơn vị * 0.75) / Tổng tiết nửa sau.
   - *Lưu ý:* Tổng tỉ lệ % điểm của tất cả các đơn vị cộng lại phải bằng 100%.

2. **Cấu trúc điểm theo dạng câu hỏi (Cố định):**
   - **Phần I (Trắc nghiệm nhiều lựa chọn):** 3.0 điểm (30%).
   - **Phần II (Trắc nghiệm Đúng-Sai):** 2.0 điểm (20%).
   - **Phần III (Trắc nghiệm Trả lời ngắn):** 2.0 điểm (20%).
   - **Phần IV (Tự luận):** 3.0 điểm (30%).
   - *Tổng cộng:* TNKQ (7.0 điểm) + Tự luận (3.0 điểm) = 10.0 điểm.

3. **Cấu trúc điểm theo mức độ nhận thức (cố định bắt buộc):**
   - **Biết:** ~40% (4.0 điểm), không được lớn hơn 40% .
   - **Hiểu:** ~30% (3.0 điểm), không được hơn.
   - **Vận dụng:** ~30% (3.0 điểm), không được hơn.
   - *Yêu cầu:* Mỗi loại câu hỏi phải có đủ cả 3 mức độ.

4. **Quy đổi số lượng câu hỏi (Dựa trên thời lượng ${time} phút):**
   - **MCQ (0.25đ/câu):** Cần 3.0 điểm => 12 câu.
   - **Đúng-Sai (1.0đ/câu chùm):** Cần 2.0 điểm => 2 câu chùm (mỗi câu chùm 4 ý).
   - **Trả lời ngắn (0.5đ/câu):** Cần 2.0 điểm => 4 câu.
   - **Tự luận:** Cần 3.0 điểm => 2-3 câu (phân phối điểm linh hoạt, ví dụ: 1.5đ + 1.0đ + 0.5đ).
   - *Tổng số câu:* Điều chỉnh phù hợp với thời gian làm bài (45/60/90 phút) nhưng phải giữ đúng tổng điểm từng phần.

**II. YÊU CẦU VỀ ĐỊNH DẠNG VÀ CẤU TRÚC BẢNG (BẮT BUỘC):**

**A. PHẦN I – MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ**
*Tạo bảng HTML có đúng 19 cột. Cấu trúc cụ thể:* 

* **HEADER (Dòng 1-4):**
    * **Dòng 1:**
        * Cột 1 (A): 'rowspan="4"': **TT**
        * Cột 2 (B): 'rowspan="4"': **Chủ đề/Chương**
        * Cột 3 (C): 'rowspan="4"': **Nội dung/đơn vị kiến thức**
        * Cột 4-15 (D-O): 'colspan="12"': **Mức độ đánh giá**
        * Cột 16-18 (P-R): 'colspan="3"': **Tổng số câu**
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

B. PHẦN II – HƯỚNG DẪN ĐIỀN VÀ TÍNH TOÁN DỮ LIỆU TRONG BẢNG MA TRẬN
                *QUY TẮC TÍNH TOÁN BẮT BUỘC (áp dụng cho footer của bảng) — **PHẢI LÀM THEO TUẦN TỰ SAU** (1 → 2 → 3 → 4 → 5):
                    
                    **Chú ý trước khi bắt đầu:** Gemini phải kiểm tra kiểu dữ liệu và tính hợp lệ:
                    - Mọi ô số lượng câu trong BODY phải là số nguyên không âm (0,1,2,...). Nếu có ô không phải số nguyên, coi là lỗi và tự sửa (làm tròn xuống nếu cần, nhưng chỉ khi có bằng chứng rõ ràng từ body; ưu tiên thông báo trong phần log nội bộ).
                    - Tổng số câu toàn bài (TotalQuestions) phải > 0.
                    
                    **Bước 1 — Tổng số câu (Total Questions):**
                    - TotalQuestions = tổng của tất cả số câu ở từng mức độ, tính theo dạng câu:
                      TotalQuestions = (Tổng MCQ across all rows) + (Tổng Đ-S across all rows) + (Tổng TLN across all rows) + (Tổng TL_count across all rows)
                    - Ghi rõ phép cộng theo ô: cộng dọc từng ô nhỏ ở footer (ô D-O) để ra 12 giá trị con, rồi tổng lại theo nhóm để ra 4 nhóm chính (MCQ, Đ-S, TLN, TL).
                    - **Không làm tròn số** khi cộng số lượng câu (vì là số nguyên).
                    
                    **Bước 2 — Tổng điểm & Điểm mỗi câu:**
                    - Tổng điểm của bài = 10.0 (hoặc giá trị khác nếu tôi cung cấp — dùng giá trị đó).
                    - *Quy tắc TL đặc biệt:* Các câu Tự luận (TL) có thể có điểm không cân bằng giữa các câu (ví dụ 1.5 + 1.0 + 0.5). Trong footer, cần 2 đại lượng liên quan tới TL:
                      - TL_count = tổng số câu tự luận (số nguyên).
                      - TL_points_total = tổng điểm tất cả câu tự luận (số thực), do Gemini tính dựa trên việc phân bổ điểm từng câu TL khi đã phân bổ trong BODY.
                    - Điểm mỗi câu tiêu chuẩn (PointPerItem) **chỉ áp dụng cho các câu trắc nghiệm và câu ngắn có cùng chuẩn điểm** (MCQ = 0.25, Đ-S = 1.0, TLN = 0.5). Công thức chung:
                      - PointPerMCQ = 0.25 (cố định)
                      - PointPerDS = 1.0 (cố định) — ghi chú: 1 "câu" Đ-S = 1 chùm 4 ý.
                      - PointPerTLN = 0.5 (cố định)
                      - PointPerTL: các giá trị điểm cho từng câu TL phải được xác định rõ trong BODY; Gemini sẽ dùng các giá trị đó để tính TL_points_total.
                    - **Tính toán bắt buộc:** TotalPointsComputed = (TotalMCQ * 0.25) + (TotalDS * 1.0) + (TotalTLN * 0.5) + (TL_points_total)
                      - TotalPointsComputed phải bằng Tổng điểm của bài (ví dụ 10.0) trong giới hạn sai số do làm tròn (xem Bước 4).
                    
                    **Bước 3 — Điểm theo từng mức độ (Row Points cho mỗi mức độ Biết/Hiểu/Vận dụng):**
                    - Với mỗi hàng (một đơn vị kiến thức), RowPoints_Mức = (Số câu ở mức đó trong hàng) × (Điểm tương ứng của từng loại câu).
                      - Ví dụ: RowPoints_Biết = (MCQ-Biết × 0.25) + (Đ-S-Biết × 1.0) + (TLN-Biết × 0.5) + (TL-Biết_points)
                      - **Không làm tròn** khi nhân; chỉ làm tròn kết quả hiển thị theo quy tắc làm tròn (Bước 4).
                    - Tổng các RowPoints_Biết của tất cả hàng = TotalPoints_Biết (tương tự cho Hiểu, Vận dụng).
                    
                    **Bước 4 — Quy tắc làm tròn và phần trăm:**
                    - Khi cần hiển thị số thập phân:
                      - Điểm của mỗi câu (nếu không là số nguyên) và RowPoints: làm tròn **tối đa 3 chữ số thập phân** (ví dụ 0.400).
                      - Tỉ lệ phần trăm (%): làm tròn **tối đa 2 chữ số thập phân** (ví dụ 30.00%).
                    - Tolerances:
                      - Tổng % (cộng P,Q,R,S...) phải bằng **100.00% ± 0.01%**. Nếu sai lệch do làm tròn, Gemini phải điều chỉnh **ô S (Tỉ lệ % điểm)** hoặc một ô tỉ lệ có quyền điều chỉnh nhỏ nhất để bù tiếp, ghi rõ ô nào đã được điều chỉnh (nội bộ).
                      - Tổng điểm (TotalPointsComputed) phải khớp với Tổng điểm bài trong sai số **±0.001** sau khi làm tròn hiển thị. Nếu không khớp, Gemini phải tìm và chỉnh sửa các giá trị TL_points_total (nếu TL chưa rõ) hoặc cảnh báo lỗi rõ ràng (và sửa trước khi xuất kết quả).
                    
                    **Bước 5 — Kiểm tra toàn vẹn dữ liệu trước khi xuất kết quả (Validation cuối cùng):**
                    Gemini phải thực hiện các kiểm tra sau và **sửa tự động** nếu phát hiện vấn đề (và báo cáo các sửa đổi trong log nội bộ):
                    ✔ TotalQuestions = tổng các câu theo từng nhóm và theo ô D-O. (kiểm tra integer equality)  
                    ✔ TotalPointsComputed = Tổng điểm bài (ví dụ 10.0) ±0.001.  
                    ✔ Tổng % = 100.00% ±0.01%.  
                    ✔ Số câu khớp cấu trúc quy đổi ở phần "Quy đổi số lượng câu" ở trên (ví dụ MCQ phải ra 12 v.v.).  
                    ✔ Không tự ý thay đổi cấu trúc bảng hoặc vị trí footer.  
                    ✔ Không viết thừa hoặc thiếu cột.  
                    Nếu phát hiện sai → Gemini phải tự sửa theo nguyên tắc: chỉ sửa các ô tính toán (footer hoặc ô tổng của từng hàng) — **không sửa nội dung mô tả trong cột Chủ đề/Chương/Nội dung**.
                    
                    II. QUY TẮC VỀ CÁCH ĐIỀN NỘI DUNG
                    1. Không tự ý thay đổi cấu trúc bảng
                    Không thêm, không xóa ô
                    Không thay đổi colspan, rowspan
                    Không đổi vị trí header/footer
                    2. Chỉ được điền nội dung vào các ô tôi ký hiệu (…điền nội dung…)
                    3. Không sinh thêm HTML ngoài cấu trúc bảng đã cung cấp
                    4. Tuyệt đối không sáng tạo thêm logic khác

BODY (Dữ liệu cho từng đơn vị kiến thức) — **QUY TẮC RÕ RÀNG VỀ NHẬP LIỆU**:
- Cột TT, Chủ đề, Nội dung: Điền chính xác nội dung đơn vị kiến thức (chuỗi văn bản).
- Ở các cột con của mỗi dạng câu (MCQ-Biết, MCQ-Hiểu, MCQ-Vận dụng, Đ-S-Biết,... TL-Vận dụng,...):
  - **Chỉ điền số lượng câu** (số nguyên ≥ 0). **Không** điền phần trăm hay điểm ở đây.
  - Nếu là ô thuộc phần Tự luận (TL), và nếu câu tự luận có điểm khác nhau, phải **điền thêm ô phụ trong hàng đó** (cùng hàng, định dạng nội bộ) chỉ định điểm từng câu TL của hàng này (ví dụ: TL_câu1:1.5; TL_câu2:1.0). Nếu không có nhiều ô phụ, Gemini phải ghi chú điểm từng câu TL ở dạng 'TL_points=[1.5,1.0]' trong một ô được phép (theo định dạng HTML cell tôi đã chỉ định).
- Cột Tổng số câu (P, Q, R cho hàng): **KHÔNG** nhập tay — hệ thống **TỰ ĐỘNG TÍNH** tổng số câu theo từng mức độ cho hàng đó.
- Cột Tỉ lệ % điểm (S hàng): Ghi chính xác tỉ lệ phần trăm điểm của **đơn vị kiến thức đó** theo công thức tỉ lệ điểm ở trên (đã đề cập trong phần I). Gemini phải định dạng số phần trăm theo 2 chữ số thập phân.

FOOTER (Dòng TỔNG KẾT - THỰC HIỆN TÍNH TOÁN SAU KHI ĐIỀN HẾT BODY) — **CÁC BƯỚC THỰC THI RÕ RÀNG**:
1. Dòng "Tổng số câu":
   - Cột 4-15 (D-O): Cộng dọc tất cả số câu đã điền ở các hàng trong Body, để ra tổng số câu cho từng ô nhỏ (VD: MCQ-Biết, Đ-S-Hiểu...). (Kết quả là 12 ô con tương ứng từng ô nhỏ).
   - Cột 16-18 (P-R): Tự động cộng dọc các giá trị "Tổng số câu" của từng hàng, ra tổng số câu toàn bài theo mức độ (Biết, Hiểu, Vận dụng). (Kết quả là 3 ô P,Q,R).
   - **KIỂM TRA**: Tổng số câu theo phần (MCQ total, Đ-S total, TLN total, TL_count) phải khớp với số lượng đã quy đổi ở phần "Quy đổi số lượng câu" (mục I.4). Nếu không khớp, Gemini phải điều chỉnh phân bổ trong BODY (nếu khả thi) ưu tiên thay đổi các ô có thể điều chỉnh (ví dụ các ô MCQ-Vận dụng nếu vượt/thiếu) và ghi log sửa.
2. Dòng "Tổng số điểm":
   - Ô A-C (gộp): Ghi chữ "Tổng số điểm".
   - Ô D-F (gộp, cho phần MCQ): Tính = (Tổng số câu MCQ) * 0.25. Kết quả PHẢI là 3.0 (sai lệch do làm tròn không quá ±0.001).
   - Ô G-I (gộp, cho phần Đúng-Sai): Tính = (Tổng số câu dạng Đ-S) * 1.0. Kết quả PHẢI là 2.0.
   - Ô J-L (gộp, cho phần Trả lời ngắn): Tính = (Tổng số câu TLN) * 0.5. Kết quả PHẢI là 2.0.
   - Ô M-O (gộp, cho phần Tự luận): Tính = TL_points_total (tổng điểm các câu TL). Kết quả PHẢI là 3.0.
   - Ô P (Tổng điểm mức Biết): Tính = (Tổng câu MCQ-Biết * 0.25) + (Tổng câu Đ-S-Biết * 1.0) + (Tổng câu TLN-Biết * 0.5) + (Tổng điểm TL-Biết).
   - Ô Q (Tổng điểm mức Hiểu): Tương tự cho Hiểu.
   - Ô R (Tổng điểm mức Vận dụng): Tương tự cho Vận dụng.
   - Ô S: Ghi Tổng điểm bài (ví dụ 10.0).
   - **Tất cả ô điểm phải được tính tự động**; Gemini không được nhập thủ công ô điểm tổng nếu có mâu thuẫn.
3. Dòng "Tỉ lệ %":
   - Cấu trúc gộp ô giống hệt dòng "Tổng số điểm".
   - Giá trị ô = (Điểm ô tương ứng / Tổng điểm bài) * 100.
   - Làm tròn % hiển thị theo quy tắc Bước 4 ở trên. Tổng các % phải bằng 100.00% ±0.01%.
4. **Báo cáo SAI & SỬA TỰ ĐỘNG:** Nếu bất kỳ kiểm tra nào (số câu, tổng điểm, tổng %) thất bại, Gemini phải:
   - (a) Ghi rõ nguyên nhân lỗi (ví dụ: "MCQ tổng 11 != yêu cầu 12") trong phần log nội bộ;
   - (b) Nếu có thể, tự sửa bằng cách điều chỉnh các ô câu có thể thay đổi nhỏ (ví dụ chuyển 1 câu từ mức Hiểu sang Vận dụng trong cùng đơn vị nếu chưa vi phạm ràng buộc tối thiểu 20% Vận dụng), rồi chạy lại toàn bộ kiểm tra. Mọi thay đổi tự động phải được tối thiểu hóa và ghi lại.
   - (c) Nếu không thể sửa tự động mà vẫn đảm bảo tất cả ràng buộc, phải trả về lỗi rõ ràng (kèm log) và không xuất kết quả cuối cùng.

**B. PHẦN II – BẢN ĐẶC TẢ ĐỀ KIỂM TRA**
*Tạo bảng HTML có 16 cột:*
* Cột 1-3: Giống phần Ma trận.
* Cột 4: **Yêu cầu cần đạt** (Mô tả chi tiết kiến thức/kỹ năng cần kiểm tra cho từng mức độ Biết/Hiểu/Vận dụng, mỗi ý xuống dòng bằng thẻ '<br>'). 
* Cột 5-16: Số câu hỏi ở các mức độ (tương ứng với các cột D-O ở ma trận). (Các ô số lượng câu ở đây phải là số nguyên và khớp với ma trận.)

**C. PHẦN III – ĐỀ KIỂM TRA & ĐÁP ÁN**
* **Đề bài:**
    * Phân chia rõ ràng 2 phần: **I. TRẮC NGHIỆM KHÁCH QUAN** (7.0đ) và **II. TỰ LUẬN** (3.0đ).
    * **Phần I:** Chia thành 3 tiểu mục: 
        * **Phần 1 (MCQ):** 12 câu.
        * **Phần 2 (Đúng-Sai):** 2 câu chùm (kẻ bảng 3 cột: Nội dung, Đúng ,Sai cho học sinh tích).
        * **Phần 3 (Trả lời ngắn):** 4 câu.
    * **Phần II:** 2-3 câu tự luận, ghi rõ điểm số từng câu.
    * *Lưu ý:* Mỗi câu hỏi phải có mã ma trận (ví dụ: '(M1-B)' cho Mức 1 - Biết).
* **Đáp án & Hướng dẫn chấm:**
    * **Phần 1 (MCQ):** Kẻ bảng 2 dòng (Dòng 1: Số câu 1-12, Dòng 2: Đáp án A/B/C/D).
    * **Phần 2 (Đúng-Sai):** Kẻ bảng chi tiết cho từng câu chùm (4 ý a,b,c,d -> Đ/S).
    * **Phần 3 (Trả lời ngắn):** Liệt kê đáp án đúng.
    * **Tự luận:** Kẻ bảng 3 cột (Câu , Nội dung/Đáp án chi tiết , Điểm thành phần).

**III. QUY ĐỊNH KỸ THUẬT (BẮT BUỘC):**
1.  **Định dạng:** Chỉ trả về mã **HTML Table** ('<table border="1">...</table>').
2.  **Không dùng Markdown:** Tuyệt đối không dùng \html \ hoặc\|---|\.
3.  **Xuống dòng:** Sử dụng thẻ '<br>' thay cho dấu xuống dòng '\n'.
4.  **Công thức Toán:** Sử dụng LaTeX chuẩn, bao quanh bởi dấu $$ (ví dụ: $$x^2 + \sqrt{5}$$). Không dùng MathML.
5.  **Trắc nghiệm:** Các đáp án A, B, C, D phải nằm trên các dòng riêng biệt (dùng <br>).
    * Ví dụ: A. Đáp án A <br> B. Đáp án B...
6.  **Tính toán:** Hãy kiểm tra lại các phép cộng hàng dọc và hàng ngang trong ma trận để đảm bảo số liệu khớp 100%.
              `;

           // --- 3. GỌI GOOGLE API (FETCH) ---
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

            // --- 4. XỬ LÝ STREAM & TRẢ VỀ CLIENT ---
            // Chúng ta tạo một TransformStream để đọc dữ liệu SSE từ Google,
            // lọc lấy phần text và gửi về cho Client ngay lập tức.
            
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            // Xử lý bất đồng bộ ở nền (Background processing)
            (async () => {
                const reader = response.body.getReader();
                let buffer = "";

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        // Giải mã chunk và cộng vào buffer
                        const chunk = decoder.decode(value, { stream: true });
                        buffer += chunk;

                        // Tách các dòng dữ liệu (SSE format: "data: {...}")
                        const lines = buffer.split("\n");
                        buffer = lines.pop(); // Giữ lại phần cuối chưa trọn vẹn

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                const jsonStr = line.substring(6).trim();
                                if (jsonStr === "[DONE]") continue; // Kết thúc stream

                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    // Trích xuất văn bản từ JSON của Google
                                    const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                                    if (textPart) {
                                        // Gửi văn bản sạch về cho Client
                                        await writer.write(encoder.encode(textPart));
                                    }
                                } catch (e) {
                                    // Bỏ qua các dòng không phải JSON (nếu có)
                                }
                            }
                        }
                    }
                    
                    // --- TRỪ TIỀN SAU KHI HOÀN TẤT ---
                    if (env.TEST_TOOL && license_key) {
                        const creditStr = await env.TEST_TOOL.get(license_key);
                        if (creditStr) {
                            let current = parseInt(creditStr);
                            if (current > 0) await env.TEST_TOOL.put(license_key, (current - 1).toString());
                        }
                    }

                } catch (err) {
                    // Gửi lỗi về Client nếu bị ngắt giữa chừng
                    await writer.write(encoder.encode(`\n\n[LỖI STREAM]: ${err.message}`));
                } finally {
                    await writer.close();
                }
            })();

            // Trả về Stream ngay lập tức
            return new Response(readable, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: `Lỗi Server: ${error.message}` }), { status: 500, headers: corsHeaders });
        }
    }
}







