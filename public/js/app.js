// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    addTopicRow(); 
    const on = (id, e, f) => { const el = document.getElementById(id); if(el) el.addEventListener(e, f); }
    on('btnAddTopic', 'click', addTopicRow);
    on('btnGenerate', 'click', handleGenerate);
    on('btnDownloadWord', 'click', handleDownloadWord);
    
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

    loading.classList.remove('hidden'); error.innerText = ""; sec.classList.add('hidden'); prev.innerHTML = ""; btn.disabled = true;

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

        const res = await fetch('/api_matrix', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
        if(!res.ok) throw new Error("Lỗi Server AI: " + res.statusText);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullContent += decoder.decode(value, {stream:true});
        }
        
        // 1. Lấy bảng sạch
        let cleanHTML = extractTableHTML(fullContent);
        if (!cleanHTML) throw new Error("Lỗi dữ liệu từ AI. Hãy thử lại!");

        // 2. Xóa khoảng trắng thừa (Word ghét khoảng trắng trong MathML)
        cleanHTML = cleanHTML.replace(/>\s+</g, '><').trim();

        prev.innerHTML = cleanHTML;
        window.generatedHTML = cleanHTML;
        
        sec.classList.remove('hidden');
        sec.scrollIntoView({behavior: 'smooth'});

    } catch(e) {
        error.innerText = "Lỗi: " + e.message;
        error.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden'); btn.disabled = false;
    }
}

function extractTableHTML(rawString) {
    const tableStartRegex = /<table[\s\S]*?>/i;
    const startMatch = rawString.match(tableStartRegex);
    if (!startMatch) return null;
    const startIndex = startMatch.index;
    const endIndex = rawString.lastIndexOf('</table>');
    if (endIndex === -1 || endIndex < startIndex) return null;
    return rawString.substring(startIndex, endIndex + 8);
}

// --- HÀM THÊM PREFIX mml: (CHÌA KHÓA ĐỂ SỬA LỖI) ---
function addMMLPrefix(html) {
    // Danh sách các thẻ MathML phổ biến
    const tags = ['math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mfrac', 'msqrt', 'mroot', 'mrow', 'msup', 'msub', 'msubsup', 'mtable', 'mtr', 'mtd', 'munder', 'mover', 'munderover', 'mmultiscripts', 'menclose', 'merror', 'mpadded', 'mphantom', 'mstyle'];
    
    let processed = html;
    // Regex tìm thẻ mở <tag> và thẻ đóng </tag> để thêm mml:
    tags.forEach(tag => {
        // Thay thẻ mở <tag ...> thành <mml:tag ...>
        const openRegex = new RegExp(`<(${tag})(\\s|>)`, 'g');
        processed = processed.replace(openRegex, '<mml:$1$2');
        
        // Thay thẻ đóng </tag> thành </mml:tag>
        const closeRegex = new RegExp(`<\\/(${tag})>`, 'g');
        processed = processed.replace(closeRegex, '</mml:$1>');
    });
    
    return processed;
}

function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    // 1. Chuyển đổi MathML HTML5 sang MathML có Namespace (Word hiểu)
    const wordFriendlyHTML = addMMLPrefix(window.generatedHTML);

    // 2. Header chuẩn XML
    const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns:m='http://schemas.microsoft.com/office/2004/12/omml' 
          xmlns:mml='http://www.w3.org/1998/Math/MathML'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
        <meta charset='utf-8'>
        <title>Đề Thi AI</title>
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 12pt; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
            td, th { border: 1px solid black; padding: 5px; vertical-align: top; }
            
            /* CSS cho MathML có prefix */
            mml\\:math { font-family: 'Cambria Math', serif; }
            mml\\:math * { font-family: 'Cambria Math', serif; }
        </style>
    </head>
    <body>`;

    const footer = "</body></html>";
    const sourceHTML = header + wordFriendlyHTML + footer;

    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    document.body.appendChild(link);
    link.href = url;
    link.download = `De_Thi_AI_${Date.now()}.doc`;
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
