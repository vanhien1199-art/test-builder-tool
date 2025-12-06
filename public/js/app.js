// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo dòng chủ đề đầu tiên
    addTopicRow(); 

    // 2. Gán sự kiện (Helper function cho gọn)
    const on = (id, e, f) => { const el = document.getElementById(id); if(el) el.addEventListener(e, f); }
    
    on('btnAddTopic', 'click', addTopicRow);
    on('btnGenerate', 'click', handleGenerate);
    on('btnDownloadWord', 'click', handleDownloadWord);
    
    // 3. Logic ẩn hiện cấu hình Học kì
    const examType = document.getElementById('exam_type');
    if(examType) {
        examType.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            const cfg = document.getElementById('hk-config');
            if(cfg) isHK ? cfg.classList.remove('hidden') : cfg.classList.add('hidden');
            document.querySelectorAll('.hk-period-inputs').forEach(d => isHK ? d.classList.remove('hidden') : d.classList.add('hidden'));
        });
        // Trigger lần đầu để set đúng trạng thái
        examType.dispatchEvent(new Event('change'));
    }
});

// --- HÀM THÊM DÒNG CHỦ ĐỀ ---
function addTopicRow() {
    const box = document.getElementById('topics-container');
    const tpl = document.getElementById('topic-template');
    if(!box || !tpl) return;
    
    const clone = tpl.content.cloneNode(true);
    box.appendChild(clone);
    
    // Gán sự kiện xóa cho nút vừa tạo
    box.lastElementChild.querySelector('.remove-topic-btn').onclick = function() { 
        this.closest('.topic-item').remove(); 
    };
    
    // Nếu đang là chế độ Học kì thì hiện ô nhập tiết
    if(document.getElementById('exam_type').value === 'hk') {
        box.lastElementChild.querySelector('.hk-period-inputs').classList.remove('hidden');
    }
}

// --- HÀM GỌI API & XỬ LÝ DỮ LIỆU ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const sec = document.getElementById('previewSection');
    const prev = document.getElementById('previewContent');

    // Reset giao diện
    loading.classList.remove('hidden'); 
    error.innerText = ""; 
    sec.classList.add('hidden'); 
    prev.innerHTML = ""; 
    btn.disabled = true;

    try {
        const get = id => document.getElementById(id).value.trim();
        
        // Thu thập dữ liệu từ Form
        const data = {
            license_key: get('license_key'), subject: get('subject'), grade: get('grade'),
            semester: get('semester'), exam_type: get('exam_type'), time: get('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: parseInt(get('total_half1'))||0, totalPeriodsHalf2: parseInt(get('total_half2'))||0,
            topics: []
        };

        document.querySelectorAll('.topic-item').forEach(r => {
            const n = r.querySelector('.topic-name').value;
            const c = r.querySelector('.topic-content').value;
            if(n) data.topics.push({name:n, content:c, p1: parseInt(r.querySelector('.topic-period-1').value)||0, p2: parseInt(r.querySelector('.topic-period-2').value)||0});
        });

        if(data.topics.length===0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề!");

        // Gọi API
        const res = await fetch('/api_matrix', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
        if(!res.ok) throw new Error("Lỗi Server AI: " + res.statusText);

        // --- KỸ THUẬT HỨNG TRỌN STREAM (BUFFERING) ---
        // Giúp tránh lỗi vỡ thẻ HTML khi mạng chậm
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullContent += decoder.decode(value, {stream:true});
        }
        
        // --- LỌC SẠCH HTML ---
        // Chỉ lấy phần bảng, bỏ qua lời dẫn của AI
        const cleanHTML = extractTableHTML(fullContent);
        if (!cleanHTML) {
            // Nếu không tìm thấy bảng, in raw ra console để debug và báo lỗi
            console.warn("AI Raw Output:", fullContent);
            throw new Error("AI trả về dữ liệu không đúng định dạng bảng. Hãy thử lại!");
        }

        // Hiển thị kết quả
        prev.innerHTML = cleanHTML;
        window.generatedHTML = cleanHTML;
        
        sec.classList.remove('hidden');
        sec.scrollIntoView({behavior: 'smooth'});

    } catch(e) {
        error.innerText = "Lỗi: " + e.message;
        error.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden'); 
        btn.disabled = false;
    }
}

// Hàm phụ trợ: Cắt lấy đúng đoạn <table>...</table>
function extractTableHTML(rawString) {
    const tableStartRegex = /<table[\s\S]*?>/i;
    const startMatch = rawString.match(tableStartRegex);
    if (!startMatch) return null;
    
    const startIndex = startMatch.index;
    const endIndex = rawString.lastIndexOf('</table>');
    
    if (endIndex === -1 || endIndex < startIndex) return null;
    
    return rawString.substring(startIndex, endIndex + 8);
}

// ============================================================
// --- HÀM XUẤT WORD NATIVE (QUAN TRỌNG NHẤT) ---
// ============================================================
function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    // Header chuẩn Microsoft Word XML
    // Bao gồm namespace 'm' (MathML) và 'w' (Word)
    // CSS được tối ưu để ép Font Cambria Math cho mọi ngóc ngách
    const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns:m='http://schemas.microsoft.com/office/2004/12/omml' 
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
        <meta charset='utf-8'>
        <title>Đề Thi AI</title>
        <style>
            /* 1. Cấu hình văn bản chung */
            body { 
                font-family: 'Times New Roman', serif; 
                font-size: 12pt; 
                line-height: 1.3;
            }
            
            /* 2. Cấu hình Bảng */
            table { 
                border-collapse: collapse; 
                width: 100%; 
                margin-bottom: 20px; 
            }
            td, th { 
                border: 1px solid black; 
                padding: 6px; 
                vertical-align: top; 
            }
            
            /* 3. Tiêu đề */
            h2, h3, h4 { 
                text-align: center; 
                margin: 10px 0; 
                font-weight: bold; 
                color: #000;
            }
            
            /* --- 4. CSS CƯỠNG CHẾ TOÁN HỌC (SIÊU QUAN TRỌNG) --- */
            
            /* Ép thẻ gốc MathML */
            math {
                font-family: 'Cambria Math', serif !important;
                font-size: 12pt;
            }
            
            /* Ép namespace của Word (nếu có) */
            m\\:math {
                font-family: 'Cambria Math', serif !important;
            }

            /* Ép TẤT CẢ các thẻ con bên trong MathML */
            /* mi: biến số, mn: số, mo: dấu, mfrac: phân số, msqrt: căn... */
            math *, math mi, math mn, math mo, math mtext, 
            math mfrac, math msqrt, math mroot, math msup, math msub, math msubsup {
                font-family: 'Cambria Math', serif !important;
            }

            /* Sửa lỗi hiển thị phân số bị nhỏ hoặc lệch */
            mfrac {
                vertical-align: middle;
            }
            
            /* Đảm bảo dấu căn hiển thị liền mạch */
            msqrt, mroot {
                font-family: 'Cambria Math', serif !important;
            }
        </style>
    </head>
    <body>`;

    const footer = "</body></html>";
    
    // Ghép nội dung
    const sourceHTML = header + window.generatedHTML + footer;

    // Tạo Blob (File ảo trong bộ nhớ)
    // MIME type 'application/msword' giúp máy tính nhận diện là file Word
    const blob = new Blob(['\ufeff', sourceHTML], {
        type: 'application/msword'
    });

    // Tạo link tải xuống
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    document.body.appendChild(link);
    link.href = url;
    
    // Đặt tên file .doc để Word tự động convert HTML
    link.download = `De_Thi_AI_${Date.now()}.doc`;
    
    // Kích hoạt tải
    link.click();
    
    // Dọn dẹp bộ nhớ
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
