// File: functions/api_matrix.js
export const config = {
  regions: ["iad", "ewr", "lhr", "fra"] 
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
                    let periodInfo = exam_type === 'hk' ? ` [Thời lượng: ${unit.p1} tiết (Nửa đầu), ${unit.p2} tiết (Nửa sau)]` : ` [Thời lượng: ${unit.p1} tiết]`;
                    topicsDescription += `   - Bài ${uIndex + 1}: ${unit.content}${periodInfo}\n`;
                });
            });
           
            // --- 3. XÂY DỰNG CẤU TRÚC ĐỀ THI ---
            let structurePrompt = use_short_answer 
                ? `CẤU TRÚC ĐỀ THI (3 PHẦN):
                   - Phần I: Trắc nghiệm nhiều lựa chọn (4 phương án chọn 1).
                   - Phần II: Trắc nghiệm Đúng/Sai (Mỗi câu có 4 ý a,b,c,d).
                   - Phần III: Câu hỏi Trả lời ngắn (Điền đáp số/kết quả).
                   - Phần IV (Nếu cần): Tự luận (Giải chi tiết).`
                : `CẤU TRÚC ĐỀ THI (2 PHẦN):
                   - Phần I: Trắc nghiệm khách quan (4 lựa chọn).
                   - Phần II: Tự luận (Giải chi tiết).`;

            // --- 4. LOGIC PHÂN BỐ ĐIỂM ---
            let scoreLogic = exam_type === 'hk' 
                ? `*LƯU Ý PHÂN BỐ ĐIỂM (CUỐI KÌ): Tổng tiết Nửa đầu HK: ${totalPeriodsHalf1}, Nửa sau HK: ${totalPeriodsHalf2}. Trọng số điểm: Nửa đầu ~25%, Nửa sau ~75%.`
                : `*LƯU Ý PHÂN BỐ ĐIỂM (GIỮA KÌ): Tổng số tiết: ${totalPeriodsHalf1}. Tính % điểm dựa trên số tiết từng bài.`;

            // --- PROMPT TỐI ƯU HÓA MẠNH MẼ (CHAIN-OF-THOUGHT) ---
            const prompt = `
            Bạn là chuyên gia khảo thí hàng đầu Việt Nam, am hiểu sâu sắc chương trình GDPT 2018 và Công văn 7991. Nhiệm vụ của bạn là xây dựng Ma trận và Đề kiểm tra chuẩn xác tuyệt đối.

            ### DỮ LIỆU ĐẦU VÀO:
            1. Môn: ${subject} - Lớp ${grade} - Bộ sách: **${book_series}**.
            2. Kỳ thi: ${exam_type === 'hk' ? 'Cuối học kì' : 'Giữa học kì'} ${semester}.
            3. Thời gian: ${time} phút.
            4. Nội dung & Thời lượng:
            ${topicsDescription}
            ${scoreLogic}

            ### TÀI LIỆU CĂN CỨ (BẮT BUỘC TUÂN THỦ):
            ${DOCUMENT_CONTENT_7991}

            ### QUY TRÌNH SUY LUẬN & ĐIỀN MA TRẬN (BẮT BUỘC THỰC HIỆN):
            Để đảm bảo ma trận chính xác, bạn hãy thực hiện suy luận theo từng bước sau đây trước khi sinh mã HTML:

            **BƯỚC 1: XÁC ĐỊNH SỐ LƯỢNG CÂU HỎI MỤC TIÊU (TARGET):**
            Dựa trên thời gian ${time} phút, hãy thiết lập mục tiêu số câu như sau (đây là HẰNG SỐ, không được thay đổi):
            - **Trường hợp A (${time} >= 60 phút):**
              + MCQ (Nhiều lựa chọn): 12 câu.
              + Đúng/Sai: 2 câu chùm.
              + Trả lời ngắn: 4 câu.
              + **Tự luận: BẮT BUỘC PHẢI CÓ từ 2 đến 3 câu.** (Tuyệt đối không được bỏ qua phần này).
            
            - **Trường hợp B (${time} <= 45 phút):**
              + MCQ: 6 câu.
              + Đúng/Sai: 1 câu chùm.
              + Trả lời ngắn: 4 câu.
              + **Tự luận: BẮT BUỘC PHẢI CÓ từ 1 đến 2 câu.**

            **BƯỚC 2: PHÂN BỔ MỨC ĐỘ NHẬN THỨC (QUAN TRỌNG):**
            *Quy tắc "Rải Đều" (Distribution Rule):*
            - **KHÔNG ĐƯỢC** dồn hết mức độ Nhận biết vào trắc nghiệm và Vận dụng vào tự luận.
            - **Cụ thể:**
              + Câu Tự luận: Phải có ít nhất 1 câu ở mức **Nhận biết** hoặc **Thông hiểu** (câu dễ gỡ điểm) và 1 câu mức **Vận dụng** (câu phân loại).
              + Câu Trắc nghiệm (MCQ): Phải có cả câu Nhận biết, Thông hiểu và Vận dụng.
              + Câu Đúng/Sai & Trả lời ngắn: Cũng phải rải rác các mức độ.

            **BƯỚC 3: ĐIỀN DỮ LIỆU VÀO MA TRẬN (MAPPING):**
            Khi điền bảng Ma trận (HTML Table), hãy kiểm tra từng hàng:
            - Hàng nào có nhiều tiết học nhất -> Phân bổ nhiều câu hỏi nhất.
            - Đảm bảo tổng dọc của cột "Tự luận" phải khớp với mục tiêu ở Bước 1 (ví dụ: Tổng phải là 2 hoặc 3). Nếu thấy đang là 0, HÃY SỬA NGAY lập tức bằng cách chuyển bớt câu hỏi từ trắc nghiệm sang hoặc thêm vào.

            ### YÊU CẦU VỀ KẾT QUẢ ĐẦU RA (HTML TABLE):
            
            **I. MA TRẬN ĐỀ KIỂM TRA (HTML TABLE 19 CỘT CHUẨN):**
            *Cấu trúc:*
            - Header: Giữ nguyên cấu trúc rowspan/colspan như mẫu.
            - Body: Điền số lượng câu hỏi (số nguyên).
            - **LƯU Ý ĐẶC BIỆT CHO PHẦN TỰ LUẬN:** + Tại các cột M, N, O (Tự luận - Biết/Hiểu/Vận dụng), bạn **PHẢI** điền số liệu sao cho tổng cộng lại > 0.
              + Ví dụ: Điền "1" vào ô Tự luận-Biết, điền "1" vào ô Tự luận-Vận dụng. Đừng để trống toàn bộ.

            **II. BẢN ĐẶC TẢ (HTML TABLE 16 CỘT):**
            - Mô tả chi tiết yêu cầu cần đạt.
            - Số lượng câu phải khớp hoàn toàn với Ma trận.

            **III. ĐỀ KIỂM TRA (CHI TIẾT):**
            - **Phần I: Trắc nghiệm (7.0 điểm)**
              + Soạn đủ số câu MCQ, Đúng/Sai, Trả lời ngắn theo Bước 1.
            - **Phần II: Tự luận (3.0 điểm) - BẮT BUỘC CÓ**
              + Câu 1 (1.0 - 1.5đ): Mức độ Nhận biết/Thông hiểu. (Ví dụ: Nêu khái niệm, tính toán đơn giản...).
              + Câu 2 (1.0 - 1.5đ): Mức độ Vận dụng. (Ví dụ: Giải quyết vấn đề thực tiễn, bài toán khó...).
            
            ### QUY ĐỊNH KỸ THUẬT:
            1. Chỉ trả về mã HTML (<table>, <tr>, <td>...).
            2. Không dùng Markdown.
            3. Xuống dòng dùng thẻ <br>.
            4. Công thức toán dùng LaTeX $$...$$.
            5. Nội dung câu hỏi phải bám sát sách **${book_series}**. Tuyệt đối không lấy kiến thức ngoài sách này.
            `;

            // --- 4. GỌI API & STREAMING ---
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

// --- GIỮ NGUYÊN BIẾN TÀI LIỆU THAM KHẢO ---
const DOCUMENT_CONTENT_7991 = `
BỘ GIÁO DỤC VÀ ĐÀO TẠO... (Giữ nguyên nội dung dài phía dưới của bạn) ...
(Kèm theo Công văn số 7991/BGDĐT-GDTrH ngày 17/12/2024 của Bộ GDĐT)
1. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ
| TT | Chủ đề/Chương | Nội dung/ĐV kiến thức | TNKQ – Nhiều lựa chọn | TNKQ – Đúng/Sai | TNKQ – Trả lời ngắn | Tự luận | Tổng | Tỉ lệ % |
|----|----------------|------------------------|------------------------|------------------|----------------------|----------|--------|----------|
| 1 | Chủ đề 1 | | Biết / Hiểu / VD | Biết / Hiểu / VD | Biết / Hiểu / VD | Biết / Hiểu / VD | (n) |    |
...
`;
