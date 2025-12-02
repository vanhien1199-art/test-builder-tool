// File: functions/api_matrix.js
import { GoogleGenerativeAI } from "@google/generative-ai";

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
            
            // --- CẤU HÌNH MODEL 2025 ---
            const MODEL_NAME = "Gemini 3 Pro Preview"; 

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: MODEL_NAME });

            const body = await request.json();
            const { license_key, subject, grade, semester, time, totalPeriodsHalf1, totalPeriodsHalf2, topics } = body;

            // --- KIỂM TRA LICENSE (Dùng biến TEST_TOOL theo code của bạn) ---
            if (env.TEST_TOOL && license_key) {
                const creditStr = await env.TEST_TOOL.get(license_key);
                if (!creditStr) return new Response(JSON.stringify({ error: "MÃ KHÔNG TỒN TẠI!" }), { status: 403, headers: corsHeaders });
                let currentCredit = parseInt(creditStr);
                if (currentCredit <= 0) return new Response(JSON.stringify({ error: "HẾT LƯỢT SỬ DỤNG!" }), { status: 402, headers: corsHeaders });
            }

            // Chuẩn bị dữ liệu Prompt
            let topicsDescription = topics.map((t, index) => {
                return `Chủ đề ${index + 1}: ${t.name} (Nội dung: ${t.content}, Tiết đầu: ${t.p1}, Tiết sau: ${t.p2})`;
            }).join("\n");

            // --- PROMPT GIỮ NGUYÊN VĂN TUYỆT ĐỐI ---
            const prompt = `
            Bạn là một trợ lý AI chuyên tạo công cụ tự động hóa việc xây dựng ma trận đề kiểm tra định kì theo Công văn số 7991/BGDĐT-GDTrH.
            
            THÔNG TIN ĐẦU VÀO:
            - Môn học: ${subject} - Lớp: ${grade}
            - Học kì: ${semester}
            - Thời gian làm bài: ${time}
            - Tổng tiết nửa đầu học kì: ${totalPeriodsHalf1}
            - Tổng tiết nửa sau học kì: ${totalPeriodsHalf2}
            
            DANH SÁCH CHỦ ĐỀ VÀ SỐ TIẾT:
            ${topicsDescription}

            HÃY THỰC HIỆN CÁC BƯỚC TÍNH TOÁN SAU:
            1. Tính tổng số tiết toàn bộ = ${totalPeriodsHalf1} + ${totalPeriodsHalf2}.
            2. Với mỗi chủ đề, tính Tỉ lệ % điểm = [(Số tiết nửa đầu / ${totalPeriodsHalf1}) * 25%] + [(Số tiết nửa sau / ${totalPeriodsHalf2}) * 75%]. Làm tròn số nguyên.
            3. Đảm bảo tổng tỉ lệ = 100%.

            OUTPUT NGHIÊM NGẶT (TRẢ VỀ ĐỊNH DẠNG MARKDOWN CHO 4 PHẦN):
            
            ## 1. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ
            (Vẽ bảng Markdown Ma trận chính xác theo mẫu Phụ lục, điền số câu và điểm số dựa trên tỉ lệ % đã tính).
            Tạo bảng có đúng 19 cột và cấu trúc như sau:

            * phần header
            Dòng 1 đến dòng 4 cột 1 (TT) gộp ô A1:A4; Cột 2 (Chủ đề/Chương) gộp B1:B4; cột 3 (Nội dung/đơn vị kiến thức) gộp ô C1:C4
            Dòng 1 gộp các ô của cột 4 đến cột 15 - D1:O1 (Mức độ đánh giá); gộp ô P1:R1 (Tổng); Cột 19 (Tỉ lệ % điểm) gộp S1:S4
            Dòng 2: Gộp ô D2:L2 (TNKQ); gộp ô M2:O2 (Tự luận); gộp ô P2:R3 (để trống không điền gì); ô S2:S3 (để trống)
            Dòng 3: Gộp ô D3:F3 (Nhiều lựa chọn); gộp ô G3:I3 (“Đúng - Sai”); gộp ô J3:L3 (Trả lời ngắn);
            Dòng 4: Cột 4- ô D4 điền mức độ nhận thức (Biết); E4 (Hiểu); F4 (Vận dụng) → lặp lại đúng 3 mức độ này cho đến ô O4
            * phần nội dung bảng
            Từ dòng 5 trở đi: điền nội dung ví dụ thực tế cho môn Khoa học tự nhiên lớp 8 học kỳ 2 (4 chủ đề lớn)
            - Cột 1 (TT): 1, 2, 3, 4, …, Tổng số câu, Tổng số điểm, Tỉ lệ %
            - Cột 2: Tên chủ đề (ví dụ: Chất và sự biến đổi của chất, Năng lượng và sự chuyển hóa, Lực và áp suất, Ánh sáng)
            - Cột 3: Nội dung chi tiết (ví dụ: Tính chất vật lí của nước, Lực đẩy Ác-si-mét, Sự phản xạ ánh sáng…)
            - Từ cột 4 đến cột 15: chỉ ghi số câu hỏi hoặc số điểm (ví dụ 1, 0.5, 2…)
            - Cột 16-18 (Tổng): tính tổng từng mức độ nhận thức của từng chủ đề
            - Cột 19: Tỉ lệ % của từng chủ đề
            Dòng “Tổng số điểm”: tổng đúng 10,0 điểm
            Dòng “Tỉ lệ %”: đúng như mẫu công văn (30% – 20% – 20% – 30% – 40% – 30% – 30% …)

            ## 2. BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ
            (Dựa vào ma trận chi tiết hóa Yêu cầu cần đạt cho từng chủ đề tương ứng với các mức độ đánh giá).
            Tạo bảng có đúng 16 cột và cấu trúc gộp ô như sau:
             * phần header
            Dòng 1 đến dòng 4  cột 1 (TT) gộp A1:A4; cột 2 (Chủ đề/Chương) gộp B1:B4; cột 3 (Nội dung/đơn vị kiến thức) gộp C1:C4; cột 4 (Yêu cầu cần đạt) gộp D1:D4
            Dòng 1 gộp ô E1:P1 (Số câu hỏi ở các mức độ đánh giá)
            Dòng 2: gộp ô E2:M2 (TNKQ); gộp ô N2:P2 (Tự luận)
            Dòng 3: gộp ô E3:G3 (Nhiều lựa chọn); gộp ô H3:J3 (“Đúng - Sai”); gộp ô K3:M3 (Trả lời ngắn); gộp ô N3:P3 (để trống không ghi gì)
            Dòng 4: 
              - E4 (Biết), F4 (Hiểu), G4 (Vận dụng) → Nhiều lựa chọn
              - H4 (Biết), I4 (Hiểu), J4 (Vận dụng) → Đúng - Sai
              - K4 (Biết), L4 (Hiểu), M4 (Vận dụng) → Trả lời ngắn 
              - N4 (Biết), O4 (Hiểu), P4 (Vận dụng) → Tự luận
            * Phần nội dung bảng
            Từ dòng 5 trở đi (nội dung):
            - Cột 1 (TT): 1, 2, 3, 4, …
            - Cột 2: Tên chủ đề (giống ma trận)
            - Cột 3: Nội dung chi tiết (giống ma trận)
            - Cột 4 (Yêu cầu cần đạt): mỗi mức độ ghi trên 1 dòng riêng, bắt đầu bằng “- Biết …”, “- Hiểu …”, “- Vận dụng …”
              → Nếu là Vận dụng thì ghi thêm ở cuối dòng (NL: THTN) hoặc (NL: GQVĐ) hoặc (NL: MĐKH) tùy năng lực
            - Cột 5 đến cột 16 (E đến P) phải dựa vào ma trận ở trên: ghi số thứ tự câu hỏi (ví dụ: 1, 2, 3, 4…) hoặc số điểm (0.5, 1.0…)
            - Dòng cuối: Tổng số câu, Tổng số điểm, Tỉ lệ % (đúng như mẫu công văn)
            ## 3. ĐỀ KIỂM TRA ĐỊNH KÌ
            (Soạn đề thi thực tế dựa trên ma trận trên. Đảm bảo câu hỏi đa dạng: Trắc nghiệm 4 chọn 1, Đúng/Sai, Trả lời ngắn, Tự luận. Nội dung phải chuẩn kiến thức ${subject} lớp ${grade}).

            ## 4. HƯỚNG DẪN CHẤM
            (Soạn đáp án chi tiết và thang điểm).
            - Thang điểm: thướng làm tròn 0,25 hoặc 0,5 hoặc 0,75 hoặc 1 ( 1 ý đúng không cho điểm nhỏ hơn 0,25 điểm)
            YÊU CẦU ĐỊNH DẠNG:
            - Sử dụng Markdown table chuẩn (| header |).
            - Không dùng code block (\`\`\`), trả về text Markdown thuần.
            - Nội dung chuyên môn phải chính xác với chương trình GDPT 2018.
            `;

            const result = await model.generateContent(prompt);
            const text = result.response.text();

            // Trừ tiền
            if (env.TEST_TOOL && license_key) {
                const creditStr = await env.TEST_TOOL.get(license_key);
                if (creditStr) {
                    let current = parseInt(creditStr);
                    await env.TEST_TOOL.put(license_key, (current - 1).toString());
                }
            }

            return new Response(JSON.stringify({ result: text }), { 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });

        } catch (error) {
            return new Response(JSON.stringify({ 
                error: `Lỗi AI (${error.message}). Hãy kiểm tra API Key hoặc Quota.` 
            }), { status: 500, headers: corsHeaders });
        }
    }
}


