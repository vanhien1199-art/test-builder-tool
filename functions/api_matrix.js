// File: functions/api_matrix.js
export const config = {
  regions: ["iad", "ewr", "lhr", "fra"] // Tối ưu Server
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

            const MODEL_NAME = "gemini-2.0-flash-exp"; // Model mạnh nhất hiện tại
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
            let totalPeriods = 0;
            topics.forEach((topic, index) => {
                topicsDescription += `\nCHƯƠNG ${index + 1}: ${topic.name}\n`;
                topic.units.forEach((unit, uIndex) => {
                    let periodInfo = exam_type === 'hk' ? 
                        ` [Tiết đầu: ${unit.p1}, Tiết sau: ${unit.p2}]` : 
                        ` [Số tiết: ${unit.p1}]`;
                    topicsDescription += `   - Bài ${uIndex + 1}: ${unit.content}${periodInfo}\n`;
                    totalPeriods += (unit.p1 || 0) + (unit.p2 || 0);
                });
            });

            // --- 3. LOGIC SỐ LƯỢNG CÂU (TỰ ĐỘNG HÓA) ---
            let qConfig = {};
            if (time <= 45) {
                // Đề ngắn (45 phút)
                qConfig = {
                    mcq: 6,  // 6 câu (0.5đ/câu) = 3.0đ
                    tf: 1,   // 1 câu chùm (4.0đ -> quy đổi 4 ý) = 2.0đ? (Cần check lại thang điểm 7991) -> Theo 7991 mới: 4đ cho phần Đ/S là 4 câu chùm. Nhưng đề 45p thường ít hơn.
                             // Đề xuất chuẩn 7991 cho 45p:
                             // P1: 12 câu (0.25) = 3.0đ
                             // P2: 2 câu chùm (4.0đ) -> Quá nhiều.
                             // => GIẢI PHÁP AN TOÀN: 
                             // P1: 6 câu (0.25đ x 2 hệ số = 0.5đ) = 3.0đ
                             // P2: 1 câu chùm (4 ý) = 4.0đ (theo thang điểm lũy tiến) -> 2.0đ??? 
                             // Logic điểm 7991 rất cứng (4đ cho P2). Nếu đề 45p thì khó.
                             // => Ưu tiên giữ cấu trúc chuẩn 7991 nhưng giảm số lượng.
                    sa: 2,   // Trả lời ngắn
                    tl: 1    // Tự luận
                };
            } else {
                // Đề chuẩn (60-90 phút)
                qConfig = {
                    mcq: 12, // 12 câu (0.25) = 3.0đ
                    tf: 2,   // 2 câu chùm = 4.0đ
                    sa: 4,   // 4 câu (0.5) = 2.0đ (Hoặc 6 câu 0.25 = 1.5đ + TL 1.5đ) -> 7991 là P3 6 câu (1.5đ)? Không, P3 thường là 4-6 câu.
                             // Cấu trúc 7991 CHUẨN (Mới nhất):
                             // P1: 12 câu x 0.25 = 3.0đ
                             // P2: 4 câu x 1.0 = 4.0đ
                             // P3: 6 câu x 0.5 = 3.0đ
                             // TỔNG 10.0Đ (KHÔNG CÓ TỰ LUẬN TRONG FORM MỚI NHẤT CỦA BỘ CHO CÁC MÔN TN, XH).
                             // TUY NHIÊN, Prompt của bạn yêu cầu CÓ TỰ LUẬN. Vậy ta dùng cấu trúc lai (Hybrid).
                    tl: 2    // Tự luận
                };
            }

            // --- 4. SIÊU PROMPT (TỐI ƯU HÓA LOGIC) ---
            const prompt = `
            Bạn là Chuyên gia Khảo thí hàng đầu Việt Nam, am hiểu tường tận Công văn 7991/BGDĐT-GDTrH.
            Nhiệm vụ: Xây dựng Ma trận và Đề kiểm tra ${subject} ${grade} (${exam_type === 'hk' ? 'Cuối kì' : 'Giữa kì'}) - Thời gian: ${time} phút.
            Bộ sách: ${book_series}.

            ### DỮ LIỆU ĐẦU VÀO (CHỈ SỬ DỤNG KIẾN THỨC NÀY):
            ${topicsDescription}

            ### YÊU CẦU CẤU TRÚC ĐỀ (BẮT BUỘC TUÂN THỦ 100%):
            Hệ thống yêu cầu cấu trúc "Lai" (Kết hợp 7991 và Tự luận truyền thống) như sau:
            
            **1. CẤU TRÚC SỐ LƯỢNG CÂU & ĐIỂM SỐ:**
            *Tổng điểm toàn bài: 10.0 điểm.*
            
            * **PHẦN I: Trắc nghiệm nhiều lựa chọn (MCQ)**
                * Số lượng: **${qConfig.mcq} câu**.
                * Điểm: ${3.0 / qConfig.mcq} điểm/câu. Tổng: **3.0 điểm**.
                * *Yêu cầu phân bổ:* Phải rải đều ở 3 mức độ (Biết, Hiểu, Vận dụng). **Bắt buộc có ít nhất 1-2 câu Vận dụng.**

            * **PHẦN II: Trắc nghiệm Đúng/Sai (Chùm câu hỏi)**
                * Số lượng: **${qConfig.tf} câu chùm** (Mỗi câu gồm 4 lệnh hỏi a,b,c,d).
                * Điểm: Tổng **4.0 điểm** (Tính theo thang điểm lũy tiến: 1 ý đúng 0.1, 2 ý 0.25, 3 ý 0.5, 4 ý 1.0).
                * *Yêu cầu phân bổ:* Các lệnh hỏi trong mỗi câu chùm phải có độ khó tăng dần (a: Biết, b: Hiểu, c: Hiểu/Vận dụng, d: Vận dụng cao).

            * **PHẦN III: Trắc nghiệm Trả lời ngắn** (hoặc Tự luận nếu môn đặc thù)
                * *Nếu có chọn "Trả lời ngắn":* **${use_short_answer ? '4 câu' : '0 câu'}**. (Tổng 2.0 điểm).
                * *Nếu dùng Tự luận (Thay thế hoặc bổ sung):* **${qConfig.tl} câu**. (Tổng 1.0 - 3.0 điểm tùy cân đối).
            
            * **PHẦN IV: TỰ LUẬN (BẮT BUỘC PHẢI CÓ)**
                * Số lượng: **2 - 3 câu**.
                * Tổng điểm: Cân đối sao cho Tổng (P1+P2+P3+P4) = 10.0.
                * **QUY TẮC VÀNG VỀ PHÂN BỔ TỰ LUẬN (QUAN TRỌNG):**
                    * **Câu 1 (Mức Biết/Hiểu):** Kiểm tra kiến thức cơ bản (Ví dụ: Nêu khái niệm, Viết phương trình, Tính toán đơn giản). **KHÔNG ĐƯỢC BỎ QUA CÂU DỄ NÀY.**
                    * **Câu 2 (Mức Vận dụng):** Bài toán tổng hợp hoặc giải quyết vấn đề thực tiễn.
                    * **Câu 3 (Mức Vận dụng cao - nếu có):** Câu hỏi phân loại 10 điểm.

            ### LOGIC ĐIỀN BẢNG MA TRẬN (STEP-BY-STEP):
            Bạn hãy thực hiện suy luận từng bước trước khi điền bảng:
            1.  **Bước 1 - Tính trọng số:** Dựa vào số tiết của từng bài trong "Dữ liệu đầu vào", tính % điểm cho từng bài. Bài nào nhiều tiết -> nhiều câu hỏi hơn.
            2.  **Bước 2 - Rải câu hỏi (Distribution):**
                * Lấy tổng 12 câu MCQ rải vào các bài theo trọng số. (Đảm bảo bài nào cũng có câu hỏi).
                * Lấy 2 câu Đúng/Sai đặt vào 2 Chủ đề trọng tâm nhất.
                * Lấy câu Tự luận đặt vào các chủ đề quan trọng (1 câu Dễ ở bài cơ bản, 1 câu Khó ở bài nâng cao).
            3.  **Bước 3 - Kiểm tra chéo (Cross-Check):**
                * Tổng MCQ có đúng 12 (hoặc 6)?
                * Tổng Đúng/Sai có đúng 2 (hoặc 1)?
                * **Có câu Tự luận mức Biết/Hiểu chưa?** (Nếu chưa -> Phải thêm ngay).
                * Tổng điểm có tròn 10.0 không?

            ### KẾT QUẢ ĐẦU RA (HTML TABLE CHUẨN):
            
            **1. MA TRẬN ĐỀ KIỂM TRA** (19 cột, định dạng rowspan/colspan chuẩn).
            - Cột "Tổng số câu": Phải tính toán chính xác tổng ngang (Biết+Hiểu+VD+VDC).
            - Cột "% điểm": Phải tính chính xác dựa trên số lượng câu x điểm từng loại.

            **2. BẢN ĐẶC TẢ** (16 cột).
            - Mô tả chi tiết yêu cầu cần đạt (Ghi rõ: "Nêu được...", "Giải thích được...", "Vận dụng...").

            **3. ĐỀ KIỂM TRA CHI TIẾT**
            - **Phần I:** Trắc nghiệm (${qConfig.mcq} câu). Đánh số câu 1, 2, ...
            - **Phần II:** Đúng/Sai (${qConfig.tf} câu). Đánh số Câu 1, Câu 2. Mỗi câu có bảng a,b,c,d.
            - **Phần III:** Trả lời ngắn / Tự luận.
                - Nếu là Tự luận: Phải ghi rõ số điểm từng câu (VD: Câu 1 (1.0 điểm): ...).

            **4. HƯỚNG DẪN CHẤM** (Đáp án chi tiết).

            ### LƯU Ý KỸ THUẬT (CHỐNG LỖI):
            1. Chỉ dùng thẻ HTML `<table>`, `<tr>`, `<td>`, `<b>`. Không dùng Markdown.
            2. Xuống dòng dùng `<br>`.
            3. Công thức toán dùng LaTeX `$$...$$`.
            4. Trắc nghiệm: Các đáp án A, B, C, D phải xuống dòng riêng biệt.
            `;

            // --- 5. GỌI API ---
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Google API Lỗi (${response.status}): ${errText}`);
            }

            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            (async () => {
                const reader = response.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split("\n");
                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            try {
                                const json = JSON.parse(line.substring(6));
                                const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (text) await writer.write(encoder.encode(text));
                            } catch (e) {}
                        }
                    }
                }
                // Trừ tiền
                if (env.TEST_TOOL && license_key) {
                    const creditStr = await env.TEST_TOOL.get(license_key);
                    if (creditStr && parseInt(creditStr) > 0) {
                        await env.TEST_TOOL.put(license_key, (parseInt(creditStr) - 1).toString());
                    }
                }
                await writer.close();
            })();

            return new Response(readable, { headers: { ...corsHeaders, "Content-Type": "text/html" } });

        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
        }
    }
}

// Giữ nguyên biến DOCUMENT_CONTENT_7991 ở cuối file (nếu có)
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

**Tổng số câu:**  
**Tổng số điểm:** 3.0 – 2.0 – 2.0 – 3.0 – 4.0 – 3.0 – 3.0  
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

**Tổng số câu:**  
**Tổng số điểm:** 3.0 – 2.0 – 2.0 – 3.0  
**Tỉ lệ %:** 30 – 20 – 20 – 30
Ghi chú

(6) “NL” là ghi tắt tên năng lực theo chương trình môn học.
`;
