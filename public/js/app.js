// File: public/js/app.js
// Phiên bản: FULL MATH SUPPORT + STREAMING + WORD EXPORT

// Biến toàn cục
var windowGeneratedHTML = ""; // Đổi tên biến để tránh xung đột

document.addEventListener('DOMContentLoaded', () => {
    console.log("--- SYSTEM READY: MATH VERSION ---");
    
    // 1. Khởi tạo dòng chủ đề đầu tiên
    addTopicRow();

    // 2. Gán sự kiện
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const examTypeSelect = document.getElementById('exam_type');

    if (btnAdd) btnAdd.addEventListener('click', addTopicRow);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);

    // 3. Xử lý Logic ẩn hiện ô nhập số tiết
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            const hkConfig = document.getElementById('hk-config');
            
            if (hkConfig) {
                if (isHK) hkConfig.classList.remove('hidden');
                else hkConfig.classList.add('hidden');
            }

            // Cập nhật cho tất cả các dòng
            document.querySelectorAll('.hk-period-inputs').forEach(el => {
                if (isHK) el.classList.remove('hidden');
                else el.classList.add('hidden');
            });
        });
        // Kích hoạt ngay lần đầu
        examTypeSelect.dispatchEvent(new Event('change'));
    }
});

// --- HÀM THÊM CHỦ ĐỀ ---
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');

    if (container && template) {
        const clone = template.content.cloneNode(true);
        
        // Gán sự kiện xóa
        const btnRemove = clone.querySelector('.remove-topic-btn');
        if (btnRemove) {
            btnRemove.addEventListener('click', function(e) {
                e.target.closest('.topic-row').remove(); // Sửa lại class nếu cần (topic-row/topic-item)
            });
        }

        container.appendChild(clone);

        // Cập nhật trạng thái hiển thị số tiết
        const examType = document.getElementById('exam_type');
        if (examType) examType.dispatchEvent(new Event('change'));
    }
}

// --- HÀM XỬ LÝ TOÁN HỌC (QUAN TRỌNG: ĐÃ THÊM VÀO) ---
function cleanMathFormulas(text) {
    if (!text) return "";
    let s = text;

    // 1. Dọn dẹp thẻ bao LaTeX
    s = s.replace(/\\\[(.*?)\\\]/g, '$1'); 
    s = s.replace(/\\\((.*?)\\\)/g, '$1'); 
    s = s.replace(/\$(.*?)\$/g, '$1');     

    // 2. Xóa rác LaTeX
    const garbage = ['\\displaystyle', '\\limits', '\\left', '\\right', '\\mathrm', '\\mathbf'];
    garbage.forEach(cmd => { s = s.split(cmd).join(''); });

    // 3. Map ký tự đặc biệt (Unicode)
    const replacements = {
        '\\\\approx': '≈', '\\\\le': '≤', '\\\\leq': '≤', '\\\\ge': '≥', '\\\\geq': '≥',
        '\\\\ne': '≠', '\\\\neq': '≠', '\\\\pm': '±', '\\\\times': '×', '\\\\div': '÷',
        '\\\\cdot': '.', '\\\\ast': '*', '\\\\circ': '°', '\\\\angle': '∠', 
        '\\\\in': '∈', '\\\\notin': '∉', '\\\\infty': '∞', '\\\\rightarrow': '→',
        '\\\\alpha': 'α', '\\\\beta': 'β', '\\\\gamma': 'γ', '\\\\Delta': 'Δ', 
        '\\\\pi': 'π', '\\\\theta': 'θ', '\\\\lambda': 'λ', '\\\\omega': 'ω', '\\\\Omega': 'Ω',
        '\\\\sqrt': '√', '\\\\{': '{', '\\\\}': '}', '\\\\%': '%',
    };
    for (const [key, value] of Object.entries(replacements)) {
        s = s.split(key).join(value);
    }

    // 4. Cấu trúc phức tạp
    s = s.replace(/\\sqrt\{(.+?)\}/g, '√($1)'); // Căn
    s = s.replace(/\\frac\{(.+?)\}\{(.+?)\}/g, '($1/$2)'); // Phân số
    s = s.replace(/\^2/g, '²'); s = s.replace(/\^3/g, '³'); s = s.replace(/\^0/g, '⁰'); // Mũ
    s = s.replace(/\^\{(.+?)\}/g, '^($1)'); // Mũ phức tạp
    s = s.replace(/_\{(.+?)\}/g, '$1'); // Chỉ số dưới
    s = s.replace(/\\vec\{(.+?)\}/g, '$1→'); // Vector
    s = s.replace(/\\hat\{(.+?)\}/g, '∠$1'); // Góc

    // 5. Dọn dẹp cuối
    s = s.replace(/\\text\{(.+?)\}/g, '$1');
    s = s.replace(/\\/g, ''); 
    s = s.replace(/\s+/g, ' ').trim();

    return s;
}

// --- XỬ LÝ CHÍNH ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    // Reset UI
    if(loading) {
        loading.style.display = 'block';
        loading.innerText = "Đang kết nối AI và tạo đề...";
    }
    if(error) error.style.display = 'none';
    if(previewSection) previewSection.style.display = 'none';
    if(previewContent) previewContent.innerHTML = "";
    if(btn) btn.disabled = true;

    try {
        const licenseKey = document.getElementById('license_key').value.trim();
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        // Thu thập dữ liệu
        const requestData = {
            license_key: licenseKey,
            subject: document.getElementById('subject').value.trim(),
            grade: document.getElementById('grade').value.trim(),
            semester: document.getElementById('semester').value,
            exam_type: document.getElementById('exam_type').value,
            time: document.getElementById('time_limit').value,
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0,
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0,
            topics: []
        };

        // Lấy danh sách chủ đề (Sửa selector cho đúng với template HTML của bạn)
        // Lưu ý: Template HTML của bạn dùng class="topic-row", cần đảm bảo querySelectorAll đúng
        const topicRows = document.querySelectorAll('.topic-row'); 
        topicRows.forEach(row => {
            // Lưu ý: Template của bạn có thể đang ẩn (display:none) -> bỏ qua dòng template gốc
            if (row.parentElement.tagName === 'TEMPLATE') return;

            const nameInput = row.querySelector('.topic-name');
            const contentInput = row.querySelector('.topic-content');
            const p1Input = row.querySelector('.topic-period-1');
            const p2Input = row.querySelector('.topic-period-2');

            if (nameInput && contentInput) {
                const name = nameInput.value.trim();
                const content = contentInput.value.trim();
                const p1 = p1Input ? (parseInt(p1Input.value) || 0) : 0;
                const p2 = p2Input ? (parseInt(p2Input.value) || 0) : 0;

                if (name && content) {
                    requestData.topics.push({ name, content, p1, p2 });
                }
            }
        });

        if (requestData.topics.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề.");

        // Gọi API
        const response = await fetch('/api_matrix', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errText = await response.text();
            let errMsg = errText;
            try { errMsg = JSON.parse(errText).error; } catch(e){}
            throw new Error(`Lỗi Server (${response.status}): ${errMsg}`);
        }

        // Đọc Stream
        previewSection.style.display = 'block';
        previewSection.scrollIntoView({ behavior: 'smooth' });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullHtml = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            
            // --- TÍCH HỢP HÀM XỬ LÝ TOÁN HỌC TẠI ĐÂY ---
            // Lưu ý: Việc xử lý stream realtime có thể cắt đôi công thức toán.
            // Tuy nhiên, cleanMathFormulas hoạt động trên text đã nhận được.
            // Để an toàn nhất, ta nên cộng dồn fullHtml rồi xử lý hiển thị.
            
            fullHtml += chunk;
            
            // Xóa rác Markdown
            let cleanChunk = fullHtml.replace(/```html/g, '').replace(/```/g, '');
            
            // Xử lý Toán học trên toàn bộ nội dung đã nhận
            let mathFixedHtml = cleanMathFormulas(cleanChunk);
            
            previewContent.innerHTML = mathFixedHtml;
        }

        // Lưu kết quả cuối cùng
        windowGeneratedHTML = previewContent.innerHTML;
        if(loading) loading.style.display = 'none';

    } catch (err) {
        error.innerHTML = `<strong>⚠️ Lỗi:</strong> ${err.message}`;
        error.style.display = 'block';
        if(loading) loading.style.display = 'none';
    } finally {
        btn.disabled = false;
    }
}

// --- XUẤT FILE WORD ---
function handleDownloadWord() {
    if (!windowGeneratedHTML) { alert("Chưa có nội dung!"); return; }

    const css = `
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.3; }
            table { width: 100%; border-collapse: collapse; border: 1pt solid black; margin-bottom: 20px; }
            th, td { border: 1pt solid black; padding: 5px; vertical-align: top; font-size: 11pt; }
            th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
            h1, h2, h3, h4 { text-align: center; font-weight: bold; margin-top: 15pt; color: #000; }
        </style>
    `;

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8">${css}</head>
        <body>${windowGeneratedHTML}</body>
        </html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent, { 
                orientation: 'landscape',
                margins: { top: 720, right: 720, bottom: 720, left: 720 }
            });
            saveAs(converted, `Ma_Tran_De_7991_${new Date().getTime()}.docx`);
        } else {
            alert("Lỗi thư viện Word. Vui lòng tải lại trang.");
        }
    } catch (e) {
        alert("Lỗi tải file: " + e.message);
    }
}
