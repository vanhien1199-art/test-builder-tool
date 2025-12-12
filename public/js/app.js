// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    addTopic();

    // Helper gán sự kiện an toàn
    const bindBtn = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    };

    bindBtn('btnAddTopic', addTopic);
    bindBtn('btnGenerate', handleGenerate);
    bindBtn('btnDownloadWord', handleDownloadWord);
    bindBtn('btnCopy', handleCopyContent);

    const examTypeSelect = document.getElementById('exam_type');
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', updatePeriodInputs);
        setTimeout(updatePeriodInputs, 100); 
    }

    // Event Delegation
    const topicContainer = document.getElementById('topics-container');
    if (topicContainer) {
        topicContainer.addEventListener('click', function(e) {
            const target = e.target;
            if (target.closest('.remove-topic-btn')) {
                if(confirm("Xóa chương này?")) target.closest('.topic-wrapper').remove();
            } else if (target.closest('.btn-add-unit')) {
                addUnit(target.closest('.topic-wrapper').querySelector('.units-container'));
            } else if (target.closest('.remove-unit-btn')) {
                target.closest('.unit-item').remove();
            }
        });
    }
});

// --- UI HELPERS ---
function updatePeriodInputs() {
    const type = document.getElementById('exam_type').value; 
    document.querySelectorAll('.unit-item').forEach(item => {
        const div1 = item.querySelector('.hk-input-1');
        const input1 = item.querySelector('.unit-p1');
        const div2 = item.querySelector('.hk-input-2');

        if (type === 'hk') {
            div1.classList.remove('hidden'); input1.placeholder = "Tiết (Đầu)";
            div2.classList.remove('hidden');
        } else {
            div1.classList.remove('hidden'); input1.placeholder = "Tổng tiết";
            div2.classList.add('hidden');
        }
    });
}

function addTopic() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (!container || !template) return;
    const clone = template.content.cloneNode(true);
    const unitsContainer = clone.querySelector('.units-container');
    container.appendChild(clone);
    addUnit(unitsContainer);
}

function addUnit(container) {
    const template = document.getElementById('unit-template');
    if (!container || !template) return;
    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
    updatePeriodInputs();
}

// --- HANDLE GENERATE ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const sec = document.getElementById('previewSection');
    const prev = document.getElementById('previewContent');

    loading.classList.remove('hidden'); 
    error.innerText = ""; sec.classList.add('hidden'); prev.innerHTML = ""; btn.disabled = true;

    try {
        const get = id => document.getElementById(id).value.trim();
        if (!get('license_key')) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        const topicsData = [];
        let totalP1 = 0, totalP2 = 0;

        document.querySelectorAll('.topic-wrapper').forEach(topicEl => {
            const topicName = topicEl.querySelector('.topic-name').value.trim();
            if (!topicName) return; 
            const units = [];
            topicEl.querySelectorAll('.unit-item').forEach(unitEl => {
                const content = unitEl.querySelector('.unit-content').value.trim();
                const p1 = parseInt(unitEl.querySelector('.unit-p1').value) || 0;
                const p2 = parseInt(unitEl.querySelector('.unit-p2').value) || 0;
                if (content) {
                    units.push({ content, p1, p2 });
                    totalP1 += p1; totalP2 += p2;
                }
            });
            if (units.length > 0) topicsData.push({ name: topicName, units: units });
        });

        if (topicsData.length === 0) throw new Error("Nhập ít nhất 1 nội dung!");

        const requestData = {
            license_key: get('license_key'), subject: get('subject'), grade: get('grade'),
            book_series: document.getElementById('book_series').value,
            semester: get('semester'), exam_type: get('exam_type'), time: get('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: totalP1, totalPeriodsHalf2: totalP2, topics: topicsData 
        };

        const res = await fetch('/api_matrix', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(requestData)
        });
        
        if(!res.ok) {
            let t = await res.text(); try { t = JSON.parse(t).error } catch(e){} throw new Error(`Server: ${t}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
        
        // Clean & Fix HTML
        let cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();
        // Format trắc nghiệm: Thêm thẻ b cho A. B. C. D. nhưng giữ nguyên cấu trúc
        cleanHTML = cleanHTML.replace(/(<br>|\n|^)\s*([A-D]\.)/g, '$1<b>$2</b>');

        prev.innerHTML = cleanHTML;
        window.generatedHTML = cleanHTML;
        sec.classList.remove('hidden'); sec.scrollIntoView({behavior:'smooth'});

    } catch(e) { 
        error.innerHTML = e.message; error.classList.remove('hidden'); 
    } finally { 
        loading.classList.add('hidden'); btn.disabled = false; 
    }
}

async function handleCopyContent() {
    if (!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    const btn = document.getElementById('btnCopy');
    const oldHtml = btn.innerHTML;
    try {
        const type = "text/html";
        const blob = new Blob([window.generatedHTML], { type });
        const data = [new ClipboardItem({ [type]: blob })];
        await navigator.clipboard.write(data);
        btn.classList.add('copied'); btn.innerHTML = `<i class="fas fa-check"></i> Đã chép!`;
        setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = oldHtml; }, 2000);
    } catch (e) { alert("Lỗi sao chép tự động."); }
}

// =========================================================================
// --- BỘ XỬ LÝ DOCX: RECURSIVE TEXT SCANNER + FULL MATH MAP ---
// =========================================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    if (typeof docx === 'undefined') { alert("Thư viện Word chưa tải xong. F5 lại trang!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerText;
    btn.innerText = "Đang xử lý..."; btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, HeadingLevel, AlignmentType, BorderStyle, Math: DocxMath, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical } = window.docx;

        // --- 1. LATEX PARSER ĐẦY ĐỦ (Phiên bản Ultimate) ---
        function parseLatexToDocx(latex) {
            const children = [];
            let i = 0;

            // KHO TỪ ĐIỂN KÝ TỰ KHỔNG LỒ
            const symbolMap = {
                // Hy Lạp (Thường & Hoa)
                '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε', '\\zeta': 'ζ',
                '\\eta': 'η', '\\theta': 'θ', '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ',
                '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ',
                '\\upsilon': 'υ', '\\phi': 'φ', '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
                '\\Delta': 'Δ', '\\Gamma': 'Γ', '\\Lambda': 'Λ', '\\Omega': 'Ω', '\\Phi': 'Φ', '\\Pi': 'Π', '\\Sigma': 'Σ',
                
                // Quan hệ & So sánh
                '\\approx': '≈', '\\neq': '≠', '\\ne': '≠', '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥',
                '\\pm': '±', '\\mp': '∓', '\\equiv': '≡', '\\sim': '∼', '\\simeq': '≃',
                
                // Phép toán
                '\\times': '×', '\\div': '÷', '\\cdot': '·', '\\ast': '*', '\\star': '⋆',
                '\\oplus': '⊕', '\\otimes': '⊗',
                
                // Tập hợp & Logic
                '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\supset': '⊃', '\\subseteq': '⊆', '\\supseteq': '⊇',
                '\\cup': '∪', '\\cap': '∩', '\\emptyset': '∅', '\\infty': '∞', '\\forall': '∀', '\\exists': '∃',
                '\\therefore': '∴', '\\because': '∵',
                '\\mathbb{R}': 'ℝ', '\\mathbb{N}': 'ℕ', '\\mathbb{Z}': 'ℤ', '\\mathbb{Q}': 'ℚ',
                
                // Mũi tên
                '\\rightarrow': '→', '\\to': '→', '\\leftarrow': '←', '\\leftrightarrow': '↔',
                '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔',
                
                // Hình học & Khác
                '\\angle': '∠', '\\triangle': '△', '\\perp': '⊥', '\\parallel': '∥',
                '\\degree': '°', '^\\circ': '°', '\\partial': '∂', '\\nabla': '∇',
                '\\%': '%', '\\$': '$', '\\{': '{', '\\}': '}'
            };

            while (i < latex.length) {
                const char = latex[i];

                if (char === '\\') {
                    // Xử lý lệnh
                    let end = i + 1;
                    while (end < latex.length && /[a-zA-Z]/.test(latex[end])) end++;
                    // Xử lý các lệnh ký tự đặc biệt như \{
                    if (end === i + 1 && end < latex.length) end++;

                    const command = latex.substring(i, end);
                    let nextIdx = end;
                    while (nextIdx < latex.length && latex[nextIdx] === ' ') nextIdx++;

                    if (command === '\\frac') {
                        const num = extractGroup(latex, nextIdx);
                        const den = extractGroup(latex, num.nextIndex);
                        children.push(new MathFraction({
                            numerator: parseLatexToDocx(num.content),
                            denominator: parseLatexToDocx(den.content)
                        }));
                        i = den.nextIndex;
                    } 
                    else if (command === '\\sqrt') {
                        if (latex[nextIdx] === '[') { // Căn bậc n
                            const degree = extractGroup(latex, nextIdx, '[', ']');
                            const arg = extractGroup(latex, degree.nextIndex);
                            children.push(new MathRadical({
                                degree: parseLatexToDocx(degree.content),
                                children: parseLatexToDocx(arg.content)
                            }));
                            i = arg.nextIndex;
                        } else { // Căn bậc 2
                            const arg = extractGroup(latex, nextIdx);
                            children.push(new MathRadical({
                                degree: [], 
                                children: parseLatexToDocx(arg.content)
                            }));
                            i = arg.nextIndex;
                        }
                    }
                    else if (command === '\\text') {
                        const txt = extractGroup(latex, nextIdx);
                        children.push(new MathRun(txt.content));
                        i = txt.nextIndex;
                    }
                    else if (command === '\\mathbb') { // Tập hợp số
                        const grp = extractGroup(latex, nextIdx);
                        const key = `\\mathbb{${grp.content}}`;
                        children.push(new MathRun(symbolMap[key] || grp.content));
                        i = grp.nextIndex;
                    }
                    else if (command === '\\left' || command === '\\right') {
                        // Bỏ qua lệnh left/right, lấy ký tự ngoặc kế tiếp
                        let bracket = latex[nextIdx];
                        children.push(new MathRun(bracket));
                        i = nextIdx + 1;
                    }
                    else if (symbolMap[command]) {
                        children.push(new MathRun(symbolMap[command]));
                        i = nextIdx;
                    } 
                    else {
                        // Lệnh lạ, bỏ qua dấu \
                        i = nextIdx; 
                    }
                } 
                else if (char === '^') {
                    const prev = children.pop();
                    let content = "", nextIdx = i + 1;
                    if (latex[nextIdx] === '{') {
                        const grp = extractGroup(latex, nextIdx);
                        content = grp.content; nextIdx = grp.nextIndex;
                    } else { content = latex[nextIdx]; nextIdx++; }
                    
                    const subNodes = parseLatexToDocx(content);
                    if (prev) {
                        children.push(new MathSuperScript({ children: [prev], superScript: subNodes }));
                    } else {
                        // Trường hợp ^2 ở đầu (hiếm gặp, nhưng xử lý an toàn)
                        children.push(new MathSuperScript({ children: [new MathRun("")], superScript: subNodes }));
                    }
                    i = nextIdx;
                } 
                else if (char === '_') {
                    const prev = children.pop();
                    let content = "", nextIdx = i + 1;
                    if (latex[nextIdx] === '{') {
                        const grp = extractGroup(latex, nextIdx);
                        content = grp.content; nextIdx = grp.nextIndex;
                    } else { content = latex[nextIdx]; nextIdx++; }
                    
                    const subNodes = parseLatexToDocx(content);
                    if (prev) {
                        children.push(new MathSubScript({ children: [prev], subScript: subNodes }));
                    } else {
                        children.push(new MathSubScript({ children: [new MathRun("")], subScript: subNodes }));
                    }
                    i = nextIdx;
                } 
                else if (char !== '{' && char !== '}') {
                    children.push(new MathRun(char));
                    i++;
                } 
                else { i++; }
            }
            return children;
        }

        function extractGroup(str, idx, open='{', close='}') {
            if (idx >= str.length) return {content:"", nextIndex:idx};
            if (str[idx] !== open) return {content:str[idx], nextIndex:idx+1};
            let depth=1, i=idx+1;
            while(i<str.length && depth>0) {
                if(str[i]===open) depth++; else if(str[i]===close) depth--;
                i++;
            }
            return {content:str.substring(idx+1, i-1), nextIndex:i};
        }

        // --- 2. HÀM QUÉT NỘI DUNG ĐỆ QUY (FIX LỖI MẤT CHỮ) ---
        function getParagraphChildren(node, currentStyle = {}) {
            let runs = [];
            
            // Hàm xử lý chuỗi văn bản thuần (bao gồm cả LaTeX)
            function processTextContent(rawText, style) {
                if (!rawText) return;
                
                // Tách các đoạn Math ($$...$$) và Text thường
                const parts = rawText.split(/(\$\$[\s\S]*?\$\$)/g);
                parts.forEach(part => {
                    if (part.startsWith('$$') && part.endsWith('$$')) {
                        const latex = part.slice(2, -2).trim();
                        runs.push(new DocxMath({ children: parseLatexToDocx(latex) }));
                    } else {
                        // Xử lý xuống dòng trong text
                        const lines = part.split('\n');
                        lines.forEach((line, index) => {
                            if (line) runs.push(new TextRun({ text: line, ...style }));
                            if (index < lines.length - 1) runs.push(new TextRun({ text: "", break: 1 }));
                        });
                    }
                });
            }

            // Duyệt qua các node con
            node.childNodes.forEach(child => {
                if (child.nodeType === 3) { // TEXT NODE
                    processTextContent(child.nodeValue, currentStyle);
                } else if (child.nodeType === 1) { // ELEMENT NODE
                    const tag = child.tagName.toLowerCase();
                    
                    if (tag === 'br') {
                        runs.push(new TextRun({ text: "", break: 1 }));
                    } else {
                        // Kế thừa style
                        const newStyle = { 
                            ...currentStyle, 
                            bold: currentStyle.bold || tag==='b' || tag==='strong', 
                            italics: currentStyle.italics || tag==='i' || tag==='em',
                            underline: currentStyle.underline || tag==='u'
                        };
                        // ĐỆ QUY
                        runs.push(...getParagraphChildren(child, newStyle));
                    }
                }
            });
            return runs;
        }

        // --- 3. MAIN CONVERTER ---
        const parser = new DOMParser();
        const docDOM = parser.parseFromString(`<div>${window.generatedHTML}</div>`, 'text/html');
        const root = docDOM.body.firstElementChild;
        const docChildren = [];

        docChildren.push(new Paragraph({
            text: "ĐỀ KIỂM TRA & MA TRẬN",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
        }));

        Array.from(root.childNodes).forEach(node => {
            if (node.nodeType === 1) {
                const tag = node.tagName.toLowerCase();

                if (tag === 'table') {
                    // XỬ LÝ BẢNG
                    const rows = Array.from(node.querySelectorAll('tr')).map(tr => {
                        const cells = Array.from(tr.querySelectorAll('td, th')).map(td => {
                            const isHeader = td.tagName.toLowerCase() === 'th';
                            // Dùng hàm đệ quy để lấy toàn bộ nội dung trong ô
                            const paraChildren = getParagraphChildren(td, { bold: isHeader });
                            
                            return new TableCell({
                                children: [new Paragraph({ 
                                    children: paraChildren,
                                    alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT
                                })],
                                columnSpan: parseInt(td.getAttribute('colspan') || 1),
                                rowSpan: parseInt(td.getAttribute('rowspan') || 1),
                                borders: {
                                    top: {style: BorderStyle.SINGLE, size: 1},
                                    bottom: {style: BorderStyle.SINGLE, size: 1},
                                    left: {style: BorderStyle.SINGLE, size: 1},
                                    right: {style: BorderStyle.SINGLE, size: 1},
                                },
                                width: { size: 100, type: WidthType.PERCENTAGE }
                            });
                        });
                        return new TableRow({ children: cells });
                    });
                    docChildren.push(new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                    docChildren.push(new Paragraph("")); 
                } 
                else if (tag.match(/^h[1-6]$/)) {
                    // XỬ LÝ TIÊU ĐỀ
                    const runs = getParagraphChildren(node, { bold: true });
                    docChildren.push(new Paragraph({
                        children: runs,
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 200, after: 100 }
                    }));
                }
                else {
                    // XỬ LÝ ĐOẠN VĂN
                    const runs = getParagraphChildren(node);
                    if (runs.length > 0) {
                        docChildren.push(new Paragraph({
                            children: runs,
                            spacing: { after: 100 }
                        }));
                    }
                }
            }
        });

        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Kiem_Tra_${Date.now()}.docx`);

    } catch(e) { 
        alert("Lỗi xuất file: " + e.message); console.error(e); 
    } finally { 
        btn.innerText = oldText; btn.disabled = false; 
    }
}
