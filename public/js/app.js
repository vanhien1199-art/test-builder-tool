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

        if(data.topics.length===0) throw new Error("Vui lòng nhập chủ đề!");

        const res = await fetch('/api_matrix', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
        if(!res.ok) throw new Error("Lỗi Server AI");

        // HỨNG DỮ LIỆU ĐỂ TRÁNH VỠ HTML
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }

        // LỌC LẤY BẢNG
        const tableMatch = fullHTML.match(/<table[\s\S]*?<\/table>/i);
        if(!tableMatch) throw new Error("AI trả về dữ liệu lỗi. Thử lại!");
        
        let cleanHTML = tableMatch[0];
        // Xóa khoảng trắng thừa giữa các thẻ (QUAN TRỌNG CHO WORD)
        cleanHTML = cleanHTML.replace(/>\s+</g, '><').trim();

        prev.innerHTML = cleanHTML;
        window.generatedHTML = cleanHTML;
        
        sec.classList.remove('hidden'); sec.scrollIntoView({behavior:'smooth'});

    } catch(e) { error.innerText = "Lỗi: " + e.message; error.classList.remove('hidden'); } finally { loading.classList.add('hidden'); btn.disabled = false; }
}

// --- HÀM QUAN TRỌNG: THÊM PREFIX mml: ---
function prefixMathML(html) {
    // Danh sách thẻ MathML cần thêm prefix
    const tags = ['math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mfrac', 'msqrt', 'mroot', 'mrow', 'msup', 'msub', 'msubsup', 'mtable', 'mtr', 'mtd', 'munder', 'mover', 'munderover', 'mmultiscripts', 'menclose', 'merror', 'mpadded', 'mphantom', 'mstyle'];
    
    let result = html;
    tags.forEach(tag => {
        // Thay thế thẻ mở <tag> thành <mml:tag>
        result = result.replace(new RegExp(`<(${tag})(\\s|>)`, 'g'), '<mml:$1$2');
        // Thay thế thẻ đóng </tag> thành </mml:tag>
        result = result.replace(new RegExp(`<\\/(${tag})>`, 'g'), '</mml:$1>');
    });
    return result;
}

function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    // 1. CHUYỂN ĐỔI MÃ MATHML CHO WORD
    const content = prefixMathML(window.generatedHTML);

    // 2. TẠO HEADER WORD (CÓ KHAI BÁO NAMESPACE mml)
    const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns:m='http://schemas.microsoft.com/office/2004/12/omml' 
          xmlns:mml='http://www.w3.org/1998/Math/MathML'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
        <meta charset='utf-8'>
        <title>Đề Thi</title>
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 12pt; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
            td, th { border: 1px solid black; padding: 5px; vertical-align: top; }
            /* Ép Word dùng font Cambria cho thẻ có prefix mml: */
            mml\\:math { font-family: 'Cambria Math', serif; }
            mml\\:math * { font-family: 'Cambria Math', serif; }
        </style>
    </head>
    <body>`;

    const source = header + content + "</body></html>";

    const blob = new Blob(['\ufeff', source], { type: 'application/msword' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `De_Thi_Native_${Date.now()}.doc`;
    link.click();
}
