// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    addTopicRow();
    
    const bind = (id, handler) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('click', handler);
    };

    bind('btnAddTopic', addTopicRow);
    bind('btnGenerate', handleGenerate);
    bind('btnDownloadWord', handleDownloadWord);
    
    const examTypeSelect = document.getElementById('exam_type');
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', () => {
            const isHK = examTypeSelect.value === 'hk';
            document.querySelectorAll('.hk-only').forEach(el => el.style.display = isHK ? 'block' : 'none');
        });
        // Kích hoạt trạng thái ban đầu
        examTypeSelect.dispatchEvent(new Event('change'));
    }
});

function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (container && template) {
        const clone = template.content.cloneNode(true);
        // Gán sự kiện xóa
        const btnRemove = clone.querySelector('.remove-topic-btn');
        if(btnRemove) {
            btnRemove.addEventListener('click', function() {
                this.closest('.topic-row').remove();
            });
        }
        container.appendChild(clone);
        
        // Cập nhật hiển thị
        const examType = document.getElementById('exam_type');
        if(examType) examType.dispatchEvent(new Event('change'));
    }
}

// --- HÀM XỬ LÝ TOÁN HỌC (PHIÊN BẢN HIỂN THỊ CHUẨN WORD) ---
function cleanMathFormulas(text) {
    if (!text) return "";
    let s = text;

    // 1. Xóa các thẻ bao LaTeX ($...$, \[...\], \(...\))
    s = s.replace(/\\\[(.*?)\\\]/g, '$1'); 
    s = s.replace(/\\\((.*?)\\\)/g, '$1'); 
    s = s.replace(/\$(.*?)\$/g, '$1');     

    // 2. Xóa các lệnh định dạng thừa
    const garbage = ['\\displaystyle', '\\limits', '\\left', '\\right', '\\mathrm', '\\mathbf', '\\it', '\\rm'];
    garbage.forEach(cmd => { s = s.split(cmd).join(''); });

    // 3. XỬ LÝ CẤU TRÚC PHỨC TẠP (Chuyển sang dạng Text dễ đọc trong Word)
    
    // Căn bậc n: \sqrt[n]{x} -> n√x
    s = s.replace(/\\sqrt\[(.+?)\]\{(.+?)\}/g, '$1√$2');
    // Căn bậc 2: \sqrt{x} -> √x
    s = s.replace(/\\sqrt\{(.+?)\}/g, '√($1)');
    s = s.replace(/\\sqrt\s+(.)/g, '√$1');

    // Phân số: \frac{a}{b} -> (a)/(b) (Dùng dấu gạch chéo để Word không bị vỡ dòng)
    s = s.replace(/\\frac\{(.+?)\}\{(.+?)\}/g, '($1/$2)');
    s = s.replace(/\\frac\s+(\w)\s+(\w)/g, '$1/$2');

    // Số mũ và chỉ số dưới
    // ^2 -> ²
    const supers = { '0':'⁰', '1':'¹', '2':'²', '3':'³', '4':'⁴', '5':'⁵', '6':'⁶', '7':'⁷', '8':'⁸', '9':'⁹', '+': '⁺', '-': '⁻', 'n': 'ⁿ' };
    s = s.replace(/\^([0-9n+\-])/g, (m, p1) => supers[p1] || m);
    s = s.replace(/\^\{([0-9n+\-]+)\}/g, (m, p1) => p1.split('').map(c => supers[c] || c).join(''));
    // Mũ phức tạp giữ nguyên dấu ^: a^{x+1} -> a^(x+1)
    s = s.replace(/\^\{(.+?)\}/g, '^($1)');

    // Chỉ số dưới: a_1 -> a₁
    const subs = { '0':'₀', '1':'₁', '2':'₂', '3':'₃', '4':'₄', '5':'₅', '6':'₆', '7':'₇', '8':'₈', '9':'₉', 'n': 'ₙ' };
    s = s.replace(/_([0-9n])/g, (m, p1) => subs[p1] || m);
    s = s.replace(/_\{([0-9n]+)\}/g, (m, p1) => p1.split('').map(c => subs[c] || c).join(''));
    s = s.replace(/_\{(.+?)\}/g, '_$1'); // Chỉ số phức tạp giữ nguyên _

    // Vector & Góc
    s = s.replace(/\\vec\{(.+?)\}/g, '$1\u20D7'); // Mũ tên trên đầu (kết hợp ký tự)
    s = s.replace(/\\hat\{(.+?)\}/g, '∠$1');

    // 4. MAP KÝ TỰ ĐẶC BIỆT (UNICODE)
    const replacements = {
        '\\\\approx': '≈', '\\\\le': '≤', '\\\\leq': '≤', '\\\\ge': '≥', '\\\\geq': '≥',
        '\\\\ne': '≠', '\\\\neq': '≠', '\\\\pm': '±', '\\\\times': '×', '\\\\div': '÷',
        '\\\\cdot': '·', '\\\\circ': '°', '\\\\angle': '∠', '\\\\triangle': '∆',
        '\\\\in': '∈', '\\\\notin': '∉', '\\\\infty': '∞', '\\\\rightarrow': '→', '\\\\Rightarrow': '⇒',
        '\\\\alpha': 'α', '\\\\beta': 'β', '\\\\gamma': 'γ', '\\\\Delta': 'Δ', '\\\\pi': 'π', 
        '\\\\theta': 'θ', '\\\\lambda': 'λ', '\\\\omega': 'ω', '\\\\Omega': 'Ω', '\\\\sigma': 'σ',
        '\\\\sqrt': '√', '\\\\{': '{', '\\\\}': '}', '\\\\%': '%',
    };

    for (const [key, value] of Object.entries(replacements)) {
        s = s.split(key).join(value);
    }

    // Dọn dẹp cuối cùng
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

    loading.style.display = 'block';
    loading.innerText = "Đang kết nối AI và viết từng dòng...";
    error.style.display = 'none';
    previewSection.style.display = 'none';
    previewContent.innerHTML = ""; 
    btn.disabled = true;

    try {
        const licenseKey = document.getElementById('license_key').value.trim();
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

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

        const topicRows = document.querySelectorAll('.topic-row');
        topicRows.forEach(row => {
            const name = row.querySelector('.topic-name').value.trim();
            const content = row.querySelector('.topic-content').value.trim();
            const p1 = parseInt(row.querySelector('.topic-period-1').value) || 0;
            const p2 = parseInt(row.querySelector('.topic-period-2').value) || 0;

            if (name && content) {
                requestData.topics.push({ name, content, p1, p2 });
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

        // ĐỌC STREAM HTML
        previewSection.style.display = 'block';
        previewSection.scrollIntoView({ behavior: 'smooth' });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullHtml = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            
            // --- ÁP DỤNG HÀM LÀM ĐẸP TOÁN HỌC VÀO CHUNK TRƯỚC KHI HIỂN THỊ ---
            let processedChunk = cleanMathFormulas(chunk);
            fullHtml += processedChunk;
            
            // Làm sạch HTML rác
            let cleanDisplay = fullHtml.replace(/```html/g, '').replace(/```/g, '');
            previewContent.innerHTML = cleanDisplay;
        }

        window.generatedHTML = previewContent.innerHTML;
        loading.style.display = 'none';

    } catch (err) {
        error.innerHTML = `<strong>⚠️ Lỗi:</strong> ${err.message}`;
        error.style.display = 'block';
        loading.style.display = 'none';
    } finally {
        btn.disabled = false;
    }
}

// --- XỬ LÝ TẢI FILE WORD (ĐỊNH DẠNG BẢNG CHUẨN) ---
function handleDownloadWord() {
    if (!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    const css = `
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.3; }
            
            /* Bảng biểu */
            table { 
                width: 100%; 
                border-collapse: collapse !important; 
                border: 1pt solid black !important;
                margin-bottom: 20px;
            }
            th, td { 
                border: 1pt solid black !important; 
                padding: 5px; 
                vertical-align: top; 
                font-size: 12pt; /* Cỡ chữ trong bảng nhỏ hơn chút */
            }
            th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
            
            /* Tiêu đề */
            h1, h2, h3, h4 { 
                text-align: center; 
                font-weight: bold; 
                margin-top: 15pt; 
                color: #000 !important;
            }
            
            /* In đậm, in nghiêng */
            b, strong { font-weight: bold; }
            i, em { font-style: italic; }
        </style>
    `;

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            ${css}
        </head>
        <body>
            ${window.generatedHTML}
        </body>
        </html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent, { 
                orientation: 'landscape',
                margins: { top: 720, right: 720, bottom: 720, left: 720 }
            });
            saveAs(converted, `Ma_Tran_De_Kiem_Tra_${new Date().getTime()}.docx`);
        } else {
            alert("Đang tải thư viện... Vui lòng thử lại.");
        }
    } catch (e) {
        alert("Lỗi tạo file: " + e.message);
    }
}
