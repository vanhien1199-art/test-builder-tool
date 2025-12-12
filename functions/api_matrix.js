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

            // --- PROMPT FINAL ---
           // PHẦN PROMPT CẦN THAY THẾ TRONG api_matrix.js
const prompt = `
Bạn là một hệ thống chuyên xây dựng ma trận đề kiểm tra theo Công văn 7991/BGDĐT-GDTrH. Nhiệm vụ của bạn là TÍNH TOÁN CHÍNH XÁC và ĐIỀN ĐÚNG SỐ LIỆU vào các bảng HTML dưới đây.

## THÔNG TIN ĐẦU VÀO:
- Môn: ${subject} - Lớp ${grade} - Bộ sách: ${book_series}
- Kỳ thi: ${exam_type === 'hk' ? 'HỌC KỲ' : 'GIỮA KỲ'} ${semester}
- Thời gian: ${time} phút
- ${use_short_answer ? 'CÓ dùng câu Trả lời ngắn' : 'KHÔNG dùng câu Trả lời ngắn'}

## CÁC BƯỚC BẠN PHẢI LÀM:

### BƯỚC 1: XÁC ĐỊNH THÔNG SỐ CỐ ĐỊNH
${
  time >= 60 
  ? `THỜI GIAN ${time} PHÚT (>=60p):
     • MCQ: 12 câu × 0.25đ = 3.0 điểm
     • Đúng-Sai: 2 câu × 1.0đ/câu = 2.0 điểm
     • Trả lời ngắn: 4 câu × 0.5đ = 2.0 điểm
     • Tự luận: 3.0 điểm (3 câu: 1.0 + 1.0 + 1.0)`
  : `THỜI GIAN ${time} PHÚT (45p):
     • MCQ: 6 câu × 0.5đ = 3.0 điểm
     • Đúng-Sai: 1 câu × 2.0đ/câu = 2.0 điểm
     • Trả lời ngắn: 4 câu × 0.5đ = 2.0 điểm
     • Tự luận: 3.0 điểm (2 câu: 2.0 + 1.0)`
}

### BƯỚC 2: TÍNH % ĐIỂM CHO TỪNG BÀI
${
  exam_type === 'gk'
  ? `CÔNG THỨC GIỮA KỲ:
     Tỉ lệ % = (Số tiết của bài / ${totalPeriodsHalf1}) × 100%
     Làm tròn 1 chữ số thập phân, tổng = 100%`
  : `CÔNG THỨC HỌC KỲ:
     1. % nửa đầu = (Số tiết p1 / ${totalPeriodsHalf1}) × 25%
     2. % nửa sau = (Số tiết p2 / ${totalPeriodsHalf2}) × 75%
     3. % tổng = % nửa đầu + % nửa sau
     Làm tròn 1 chữ số thập phân, tổng = 100%`
}

### BƯỚC 3: CHUYỂN % THÀNH SỐ CÂU HỎI
CÔNG THỨC CHO TỪNG BÀI:
1. Số câu MCQ = (Tổng câu MCQ) × (%/100)
2. Số câu Đúng-Sai = (Tổng câu Đ-S) × (%/100) 
3. Số câu Trả lời ngắn = (Tổng câu TLN) × (%/100)
4. Số câu Tự luận = (Tổng câu TL) × (%/100)

QUY TẮC LÀM TRÒN:
• Làm tròn lên/xuống để tổng số câu mỗi loại KHỚP với Bước 1
• Ví dụ: nếu cần 12 câu MCQ, phân bổ sao cho tổng = 12

### BƯỚC 4: PHÂN BỔ MỨC ĐỘ NHẬN THỨC
QUY TẮC:
1. Mỗi bài phải có cả 3 mức độ: Biết, Hiểu, Vận dụng
2. Phân đều các mức độ cho các loại câu hỏi
3. Tỉ lệ chung: Biết ~40%, Hiểu ~30%, Vận dụng ~30%

### BƯỚC 5: ĐIỀN VÀO BẢNG MA TRẬN (19 CỘT)
BẠN PHẢI TẠO BẢNG HTML VỚI CẤU TRÚC SAU:

<table border="1">
<tr>
  <th rowspan="4">TT</th>
  <th rowspan="4">Chủ đề/Chương</th>
  <th rowspan="4">Nội dung/đơn vị kiến thức</th>
  <th colspan="12">Mức độ đánh giá</th>
  <th colspan="3">Tổng</th>
  <th rowspan="4">Tỉ lệ % điểm</th>
</tr>
<tr>
  <th colspan="9">TNKQ</th>
  <th colspan="3">Tự luận</th>
</tr>
<tr>
  <th colspan="3">Nhiều lựa chọn</th>
  <th colspan="3">Đúng - Sai</th>
  <th colspan="3">Trả lời ngắn</th>
  <th colspan="3">Tự luận</th>
</tr>
<tr>
  <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
  <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
  <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
  <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
  <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
</tr>

<!-- ĐÂY LÀ NƠI BẠN ĐIỀN DỮ LIỆU -->
<!-- Ví dụ 1 dòng (thay thế bằng tính toán thực tế) -->
<tr>
  <td>1</td>
  <td>${topics[0]?.name || 'Chương 1'}</td>
  <td>${topics[0]?.units[0]?.content || 'Bài 1'}</td>
  <!-- MCQ: Biết/Hiểu/Vận dụng -->
  <td>1</td><td>1</td><td>0</td>
  <!-- Đúng-Sai: Biết/Hiểu/Vận dụng -->
  <td>0</td><td>0</td><td>0</td>
  <!-- Trả lời ngắn: Biết/Hiểu/Vận dụng -->
  <td>0</td><td>0</td><td>1</td>
  <!-- Tự luận: Biết/Hiểu/Vận dụng -->
  <td>0</td><td>0</td><td>0</td>
  <!-- Tổng câu theo mức độ (TỰ TÍNH) -->
  <td>1</td><td>1</td><td>1</td>
  <!-- % điểm (từ Bước 2) -->
  <td>25%</td>
</tr>

<!-- Thêm các dòng khác tương ứng -->

<!-- DÒNG TỔNG KẾT -->
<tr>
  <td colspan="3"><strong>Tổng số câu</strong></td>
  <!-- Cộng dọc tất cả các cột trên -->
  <td>4</td><td>4</td><td>4</td> <!-- MCQ -->
  <td>1</td><td>1</td><td>0</td> <!-- Đúng-Sai -->
  <td>2</td><td>1</td><td>1</td> <!-- Trả lời ngắn -->
  <td>1</td><td>1</td><td>1</td> <!-- Tự luận -->
  <td>8</td><td>7</td><td>6</td> <!-- Tổng mức độ -->
  <td>100%</td>
</tr>

<tr>
  <td colspan="3"><strong>Tổng số điểm</strong></td>
  <!-- MCQ: số câu × điểm/câu -->
  <td colspan="3">${time >= 60 ? '12 × 0.25 = 3.0' : '6 × 0.5 = 3.0'}</td>
  <!-- Đúng-Sai -->
  <td colspan="3">${time >= 60 ? '2 × 1.0 = 2.0' : '1 × 2.0 = 2.0'}</td>
  <!-- Trả lời ngắn -->
  <td colspan="3">4 × 0.5 = 2.0</td>
  <!-- Tự luận -->
  <td colspan="3">3.0</td>
  <!-- Tổng điểm mức độ -->
  <td>4.0</td><td>3.0</td><td>3.0</td>
  <td><strong>10.0</strong></td>
</tr>

<tr>
  <td colspan="3"><strong>Tỉ lệ %</strong></td>
  <td colspan="3">30%</td>
  <td colspan="3">20%</td>
  <td colspan="3">20%</td>
  <td colspan="3">30%</td>
  <td>40%</td><td>30%</td><td>30%</td>
  <td>100%</td>
</tr>
</table>

## YÊU CẦU QUAN TRỌNG KHI TÍNH TOÁN:

1. **TÍNH % TRƯỚC**: Dùng công thức ở Bước 2 để tính % điểm cho từng bài
2. **CHUYỂN THÀNH CÂU**: Dùng công thức ở Bước 3 để chuyển % thành số câu
3. **KIỂM TRA TỔNG**: Tổng câu MCQ = ${time >= 60 ? '12' : '6'}, Đúng-Sai = ${time >= 60 ? '2' : '1'}, TLN = 4, TL = ${time >= 60 ? '3' : '2'}
4. **PHÂN MỨC ĐỘ**: Mỗi bài có ít nhất 1 câu mỗi mức độ
5. **TỔNG ĐIỂM = 10.0**: Luôn kiểm tra
## BẢNG ĐẶC TẢ (sau ma trận):
Tạo bảng 16 cột với:
- Cột 1-3: TT, Chủ đề, Nội dung (giống ma trận)
- Cột 4: "Yêu cầu cần đạt" (mô tả kiến thức)
- Cột 5-16: Copy số câu từ ma trận (cột D-O)

## ĐỀ THI & ĐÁP ÁN:
Tạo đề thi với:
- Phần I: Trắc nghiệm (MCQ + Đúng-Sai + Trả lời ngắn)
- Phần II: Tự luận
- Mỗi câu có mã: [Mức độ-Mã]

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











