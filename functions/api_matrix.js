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
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (CUỐI KÌ): Tổng tiết Nửa đầu HK: ${totalPeriodsHalf1}, Nửa sau HK: ${totalPeriodsHalf2}. Phân bổ điểm tỷ lệ Hãy tính tỉ lệ điểm dựa trên trọng số này: Nửa đầu ~25%, Nửa sau ~75%.`;
            } else {
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (GIỮA KÌ): Tổng số tiết: ${totalPeriodsHalf1}. Tính % điểm dựa trên số tiết từng bài.`;
            }

            // --- PROMPT FINAL (ĐÃ TỐI ƯU MẠNH MẼ) ---
            const prompt = `
            Bạn là một trợ lý chuyên gia khảo thí hàng đầu Việt Nam, có nhiệm vụ xây dựng ma trận và đề kiểm tra chất lượng cao theo đúng Công văn 7991/BGDĐT-GDTrH.

            ### TÀI LIỆU THAM KHẢO (QUAN TRỌNG - LÀM CĂN CỨ CỐT LÕI):
            ${DOCUMENT_CONTENT_7991}

            ## THÔNG TIN ĐỀ BÀI
            1. Môn: ${subject} - Lớp ${grade}
            2. Bộ sách: **${book_series}** (BẮT BUỘC dùng đúng thuật ngữ, định nghĩa, nội dung của bộ sách này).
            3. Kỳ thi: ${exam_type === 'hk' ? 'Cuối học kì' : 'Giữa học kì'} ${semester}.
            4. Thời gian làm bài: **${time} phút**.

            ${structurePrompt}

            ## NỘI DUNG & THỜI LƯỢNG CHI TIẾT (INPUT):
            ${topicsDescription}
            ${scoreLogic}

            ## YÊU CẦU KIỂM SOÁT NỘI DUNG (ANTI-HALLUCINATION):
            1. **Đúng Bộ Sách:** Chỉ sử dụng kiến thức trong sách ${book_series} lớp ${grade}. Không lấy kiến thức của bộ sách khác (như Cánh Diều nếu đang làm KNTT).
            2. **Đúng Lớp:** Không lấy kiến thức lớp dưới hoặc lớp trên.
            3. **Chỉ Dữ Liệu Được Cung Cấp:** Chỉ ra đề trong phạm vi các bài học được liệt kê ở phần "NỘI DUNG & THỜI LƯỢNG".
            4. **Đặc thù môn học:**
               - Tin học THCS: Dùng Scratch (nếu không ghi rõ ngôn ngữ khác).
               - Tin học THPT: Dùng Python (nếu không ghi rõ ngôn ngữ khác).
               - Tiếng Anh: Ngữ liệu phù hợp trình độ A2/B1 (THCS/THPT).

            ================================================================
            ## HƯỚNG DẪN XÂY DỰNG MA TRẬN (QUAN TRỌNG NHẤT - ĐỌC KỸ)
            ================================================================
            Bạn phải thực hiện quy trình tư duy từng bước (Chain of Thought) để điền số liệu vào bảng ma trận, đảm bảo tính cân đối và đầy đủ.

            **BƯỚC 1: XÁC ĐỊNH TỔNG SỐ CÂU HỎI (HARD CONSTRAINT)**
            Dựa vào thời gian **${time} phút**, bạn BẮT BUỘC phải dùng cấu trúc sau (không được thay đổi tổng số):

            * **TRƯỜNG HỢP A: Thời gian >= 60 phút**
                -   Phần I (MCQ): **12 câu** (0.25đ/câu).
                -   Phần II (Đúng/Sai): **2 câu chùm** (mỗi câu 4 lệnh).
                -   Phần III (Trả lời ngắn): **4 câu** (0.5đ/câu).
                -   Phần IV (Tự luận - NẾU CÓ): **2-3 câu** (Tổng điểm còn lại để đủ 10).

            * **TRƯỜNG HỢP B: Thời gian <= 45 phút**
                -   Phần I (MCQ): **6 câu** (0.5đ/câu - tăng điểm để bù số lượng).
                -   Phần II (Đúng/Sai): **1 câu chùm** (mỗi câu 4 lệnh).
                -   Phần III (Trả lời ngắn): **4 câu** (0.5đ/câu).
                -   Phần IV (Tự luận - NẾU CÓ): **1-2 câu**.

            **BƯỚC 2: PHÂN BỔ SỐ LƯỢNG CÂU VÀO CÁC Ô (LOGIC PHÂN BỔ)**
            Đây là bước quan trọng nhất. Bạn phải điền số lượng câu hỏi vào các cột "Mức độ đánh giá" (Biết, Hiểu, Vận dụng) cho từng chủ đề.

            **QUY TẮC PHÂN BỔ BẮT BUỘC (KHÔNG ĐƯỢC VI PHẠM):**
            1.  **KHÔNG ĐƯỢC BỎ TRỐNG TỰ LUẬN:** Nếu cấu trúc đề yêu cầu Tự luận, bắt buộc phải có ít nhất 1-2 câu Tự luận trong ma trận.
            2.  **RẢI ĐỀU MỨC ĐỘ CHO TỪNG LOẠI CÂU:**
                -   **MCQ:** Phải có cả câu Biết (B), câu Hiểu (H). Có thể có câu Vận dụng (VD) nếu nội dung phù hợp.
                -   **Đúng/Sai:** Các lệnh hỏi trong câu chùm thường có độ khó tăng dần. Do đó, cột Đúng/Sai trong ma trận nên phân bổ ở mức Hiểu (H) hoặc Vận dụng (VD).
                -   **Trả lời ngắn:** Thường ở mức Hiểu (H) hoặc Vận dụng (VD).
                -   **Tự luận:** **BẮT BUỘC** phải có sự phân hóa.
                    * Ví dụ: Câu 1 (Tự luận) có thể là mức **Biết (B)** hoặc **Hiểu (H)** (VD: Nêu khái niệm, Trình bày tính chất...).
                    * Câu 2 (Tự luận) là mức **Vận dụng (VD)** (VD: Giải bài tập, Xử lý tình huống).
                    * -> **TUYỆT ĐỐI KHÔNG** để Tự luận chỉ toàn là Vận dụng cao. Phải có câu Tự luận mức độ thấp để học sinh trung bình làm được.

            3.  **TỔNG HỢP THEO HÀNG (CHỦ ĐỀ):**
                -   Chủ đề quan trọng (nhiều tiết): Phải gánh nhiều câu hỏi hơn.
                -   Chủ đề ít tiết: Có thể chỉ có 1-2 câu MCQ.

            **BƯỚC 3: TÍNH TOÁN SỐ LIỆU CUỐI CÙNG**
            -   **Cột Tổng số câu:** Cộng ngang các ô số lượng trong hàng.
            -   **Cột Tỉ lệ %:** Tính = (Tổng điểm của các câu trong hàng / 10.0) * 100%. (Lưu ý: Điểm MCQ khác điểm Tự luận, hãy tính cẩn thận).

            ================================================================
            ## KẾT QUẢ ĐẦU RA (OUTPUT FORMAT)
            ================================================================
            Bạn phải xuất ra 4 phần dưới dạng **HTML TABLE** chuẩn (dùng thẻ `<table>`, `<tr>`, `<td>`, `<th>`, `rowspan`, `colspan`).

            **1. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ**
            (Cấu trúc bảng 19 cột y hệt như Phụ lục 7991 đã cung cấp ở trên).
            * **Footer Ma trận:**
                -   Dòng "Tổng số câu": Cộng dọc từng cột.
                -   Dòng "Tổng điểm": Tính tổng điểm (MCQ + Đ/S + TLN + TL) = 10.0.
                -   Dòng "Tỉ lệ %": Tổng = 100%.

            **2. BẢN ĐẶC TẢ ĐỀ KIỂM TRA**
            (Cấu trúc bảng 16 cột).
            -   Mô tả chi tiết yêu cầu cần đạt (Biết:..., Hiểu:..., Vận dụng:...).
            -   Số lượng câu hỏi khớp 100% với Ma trận.

            **3. ĐỀ KIỂM TRA (ĐỀ BÀI)**
            -   Phân chia rõ: **I. TRẮC NGHIỆM** và **II. TỰ LUẬN**.
            -   Số lượng câu hỏi phải đúng chính xác theo **BƯỚC 1**.
            -   Nội dung câu hỏi: Bám sát sách giáo khoa ${book_series}.

            **4. HƯỚNG DẪN CHẤM & ĐÁP ÁN**
            -   Đáp án chi tiết, thang điểm rõ ràng.

            **QUY ĐỊNH KỸ THUẬT (BẮT BUỘC):**
            1.  Chỉ dùng **HTML Table**. KHÔNG dùng Markdown.
            2.  Xuống dòng dùng thẻ `<br>`.
            3.  Công thức toán dùng LaTeX chuẩn $$...$$.
            4.  Trắc nghiệm: Các đáp án A, B, C, D xuống dòng riêng biệt (dùng `<br>`).
            `;

            // --- 5. GỌI API & STREAMING ---
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Google API Lỗi (${response.status}): ${errText}`);
            }

            // Xử lý Stream
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
                } catch (e) {
                    await writer.write(encoder.encode(`[LỖI]: ${e.message}`));
                } finally {
                    await writer.close();
                }
            })();

            return new Response(readable, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: `System Error: ${error.message}` }), { status: 500, headers: corsHeaders });
        }
    }
}

// --- ĐẶT NỘI DUNG VĂN BẢN Ở CUỐI FILE ĐỂ CODE GỌN GÀNG ---
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
