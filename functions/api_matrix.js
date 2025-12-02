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
            
            // Kiểm tra DB (Bỏ comment dòng dưới nếu bạn đã cấu hình KV TEST_TOOL)
            // if (!env.TEST_TOOL) throw new Error("Thiếu KV Database (TEST_TOOL)");

            const body = await request.json();
            
            // 1. Lấy dữ liệu từ Frontend
            const { license_key, subject, grade, semester, time, totalPeriodsHalf1, totalPeriodsHalf2, topics } = body;

            // --- KIỂM TRA LICENSE ---
            if (env.TEST_TOOL && license_key) {
                const creditStr = await env.TEST_TOOL.get(license_key);
                if (creditStr === null) return new Response(JSON.stringify({ error: "MÃ KHÔNG TỒN TẠI!" }), { status: 403, headers: corsHeaders });
                let currentCredit = parseInt(creditStr);
                if (currentCredit <= 0) return new Response(JSON.stringify({ error: "HẾT LƯỢT SỬ DỤNG!" }), { status: 402, headers: corsHeaders });
            }

            // 2. Chuẩn bị dữ liệu Prompt
            const requestObj = {
                subject: subject,
                grade: grade,
                semester: semester,
                totalPeriodsHalf1: totalPeriodsHalf1,
                totalPeriodsHalf2: totalPeriodsHalf2
            };

            let topicsDescription = topics.map((t, index) => {
                return `Chủ đề ${index + 1}: ${t.name}
   - Nội dung: ${t.content}
   - Số tiết nửa đầu: ${t.p1}
   - Số tiết nửa sau: ${t.p2}`;
            }).join("\n");

            // --- PROMPT CỰC KỲ CHI TIẾT THEO YÊU CẦU ---
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
            (Vẽ bảng Markdown Ma trận chính xác theo mẫu Phụ lục, chia cột TNKQ (Biết, Hiểu) và Tự luận (Vận dụng, Vận dụng cao), điền số câu và điểm số dựa trên tỉ lệ % đã tính).

            ## 2. BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ
            (Vẽ bảng Markdown Bản đặc tả, chi tiết hóa Yêu cầu cần đạt cho từng chủ đề tương ứng với các mức độ đánh giá).

            ## 3. ĐỀ KIỂM TRA ĐỊNH KÌ
            (Soạn đề thi thực tế dựa trên ma trận trên. Đảm bảo câu hỏi đa dạng: Trắc nghiệm 4 chọn 1, Đúng/Sai, Trả lời ngắn, Tự luận. Nội dung phải chuẩn kiến thức ${subject} lớp ${grade}).

            ## 4. HƯỚNG DẪN CHẤM
            (Soạn đáp án chi tiết và thang điểm).

            YÊU CẦU ĐỊNH DẠNG:
            - Sử dụng Markdown table chuẩn (| header |).
            - Không dùng code block (\`\`\`), trả về text Markdown thuần.
            - Nội dung chuyên môn phải chính xác với chương trình GDPT 2018.
            `;

            // --- 4. GỌI MODEL MỚI NHẤT (GEMINI 2.5 PRO - STABLE) ---
            const genAI = new GoogleGenerativeAI(apiKey);
            
            // Cập nhật quan trọng: Sử dụng gemini-2.5-pro
            // Đây là bản ổn định, mạnh mẽ, thay thế cho 1.5 và 3.0 preview
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            
            const result = await model.generateContent(prompt);
            const text = result.response.text();

            // Trừ tiền
            if (env.TEST_TOOL && license_key) {
                const creditStr = await env.TEST_TOOL.get(license_key);
                if (creditStr) {
                    let current = parseInt(creditStr);
                    if (current > 0) await env.TEST_TOOL.put(license_key, (current - 1).toString());
                }
            }

            return new Response(JSON.stringify({ result: text }), { 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });

        } catch (error) {
            // Hiển thị lỗi chi tiết để bạn biết nếu model không chạy
            return new Response(JSON.stringify({ 
                error: `Lỗi kết nối AI: ${error.message}. (Đang dùng model: gemini-2.5-pro)` 
            }), { status: 500, headers: corsHeaders });
        }
    }
}


