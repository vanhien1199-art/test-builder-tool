// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    addTopicRow();
    
    // Gán sự kiện
    const on = (id, e, f) => { const el = document.getElementById(id); if(el) el.addEventListener(e, f); }
    on('btnAddTopic', 'click', addTopicRow);
    on('btnGenerate', 'click', handleGenerate);
    on('btnDownloadWord', 'click', handleDownloadWord);
    
    // Logic ẩn hiện học kì
    const examType = document.getElementById('exam_type');
    if(examType) {
        examType.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            const cfg = document.getElementById('hk-config');
            if(cfg) isHK ? cfg.classList.remove('hidden') : cfg.classList.add('hidden');
            document.querySelectorAll('.hk-period-inputs').forEach(d => isHK ? d.classList.remove('hidden') : d.classList.add('hidden'));
        });
        examType.dispatchEvent(new Event('change'));
    }
});

function addTopicRow() {
    const box = document.getElementById('topics-container');
    const tpl = document.getElementById('topic-template');
    if(!box || !tpl) return;
    const clone = tpl.content.cloneNode(true);
    box.appendChild(clone);
    box.lastElementChild.querySelector('.remove-topic-btn').onclick = function() { this.closest('.topic-item').remove(); };
    if(document.getElementById('exam_type').value === 'hk') box.lastElementChild.querySelector('.hk-period-inputs').classList.remove('hidden');
}

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

        // --- KHẮC PHỤC LỖI VỠ GIAO DIỆN Ở ĐÂY ---
        // Thay vì in ra ngay, ta hứng toàn bộ vào biến buffer
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = ""; // Biến chứa toàn bộ HTML sạch

        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullContent += decoder.decode(value, {stream:true});
        }
        
        // Sau khi nhận đủ 100%, mới xử lý lọc rác
        // 1. Loại bỏ markdown (```html ... ```)
        fullContent = fullContent.replace(/```html/g, '').replace(/```/g, '');
        
        // 2. Tìm điểm bắt đầu và kết thúc của HTML thực sự (tránh lời nói nhảm của AI)
        const startIndex = fullContent.indexOf('<table');
        const endIndex = fullContent.lastIndexOf('</table>');
        
        if (startIndex !== -1 && endIndex !== -1) {
            // Chỉ lấy phần Table
            fullContent = fullContent.substring(startIndex, endIndex + 8);
        }

        // Hiển thị ra màn hình
        prev.innerHTML = fullContent;
        window.generatedHTML = fullContent;
        
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

function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    // Header đặc biệt giúp Word nhận diện MathML (m) và Word (w)
    const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns:m='http://schemas.microsoft.com/office/2004/12/omml' 
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
        <meta charset='utf-8'>
        <title>Đề Thi AI</title>
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 12pt; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
            td, th { border: 1px solid black; padding: 5px; vertical-align: top; }
            h2, h3 { text-align: center; margin: 10px 0; font-weight: bold; }
            p { margin: 5px 0; }
        </style>
    </head>
    <body>`;

    const footer = "</body></html>";
    
    // Kết hợp
    const sourceHTML = header + window.generatedHTML + footer;

    // Tạo file .doc (Word 97-2003) - Định dạng này hỗ trợ HTML Native tốt nhất
    const blob = new Blob(['\ufeff', sourceHTML], {
        type: 'application/msword'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    document.body.appendChild(link);
    link.href = url;
    link.download = `De_Thi_AI_${Date.now()}.doc`;
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
