// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    addTopic();

    // Helper gán sự kiện
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
        cleanHTML = cleanHTML.replace(/(\s+)(B\.|C\.|D\.)/g, '<br><b>$2</b>').replace(/(A\.)/g, '<b>$1</b>');

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
// --- BỘ XỬ LÝ TOÁN HỌC & DOCX CAO CẤP ---
// =========================================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    if (typeof docx === 'undefined') { alert("Thư viện Word chưa tải xong. F5 lại trang!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerText;
    btn.innerText = "Đang xử lý..."; btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, HeadingLevel, AlignmentType, BorderStyle, Math: DocxMath, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical } = window.docx;

        // --- 1. LATEX PARSER ĐẦY ĐỦ (Full Symbol Map) ---
        function parseLatexToDocx(latex) {
            const children = [];
            let i = 0;

            // Map ký tự Toán học đầy đủ
            const symbolMap = {
                // Hy Lạp
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
                '\\degree': '°', '^\\circ': '°', '\\partial': '∂', '\\nabla': '∇'
            };

            while (i < latex.length) {
                const char = latex[i];

                if (char === '\\') {
                    // Xử lý lệnh
                    let end = i + 1;
                    // Tìm tên lệnh (ký tự chữ cái)
                    while (end < latex.length && /[a-zA-Z]/.test(latex[end])) {
                        end++;
                    }
                    // Nếu không có chữ cái nào, kiểm tra ký tự đặc biệt (VD: \{, \%)
                    if (end === i + 1 && end < latex.length) end++;

                    const command = latex.substring(i, end);
                    
                    // Bỏ qua khoảng trắng sau lệnh
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
                        // Kiểm tra căn bậc n: \sqrt[3]{x}
                        if (latex[nextIdx] === '[') {
                            const degree = extractGroup(latex, nextIdx, '[', ']');
                            const arg = extractGroup(latex, degree.nextIndex);
                            children.push(new MathRadical({
                                degree: parseLatexToDocx(degree.content),
                                children: parseLatexToDocx(arg.content)
                            }));
                            i = arg.nextIndex;
                        } else {
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
                        children.push(new MathRun(txt.content)); // Giữ nguyên văn bản
                        i = txt.nextIndex;
                    }
                    else if (command === '\\left' || command === '\\right') {
                        // Bỏ qua lệnh left/right, chỉ lấy ký tự tiếp theo (ví dụ (, ), [, ])
                        // Trong Docx đơn giản, ta coi như ký tự thường
                        let bracket = latex[nextIdx];
                        children.push(new MathRun(bracket));
                        i = nextIdx + 1;
                    }
                    else if (symbolMap[command]) {
                        children.push(new MathRun(symbolMap[command]));
                        i = nextIdx;
                    } 
                    else if (['\\%', '\\{', '\\}', '\\$'].includes(command)) {
                        children.push(new MathRun(command.charAt(1)));
                        i = nextIdx;
                    }
                    else {
                        // Lệnh lạ -> Bỏ qua hoặc in ra text để debug
                        i = nextIdx; 
                    }
                } 
                else if (char === '^') {
                    // Mũ
                    const prev = children.pop();
                    let supContent = "";
                    let nextIdx = i + 1;
                    if (latex[nextIdx] === '{') {
                        const grp = extractGroup(latex, nextIdx);
                        supContent = grp.content;
                        nextIdx = grp.nextIndex;
                    } else {
                        supContent = latex[nextIdx];
                        nextIdx++;
                    }
                    if (prev) {
                        children.push(new MathSuperScript({ children: [prev], superScript: parseLatexToDocx(supContent) }));
                    }
                    i = nextIdx;
                } 
                else if (char === '_') {
                    // Chỉ số dưới
                    const prev = children.pop();
                    let subContent = "";
                    let nextIdx = i + 1;
                    if (latex[nextIdx] === '{') {
                        const grp = extractGroup(latex, nextIdx);
                        subContent = grp.content;
                        nextIdx = grp.nextIndex;
                    } else {
                        subContent = latex[nextIdx];
                        nextIdx++;
                    }
                    if (prev) {
                        children.push(new MathSubScript({ children: [prev], subScript: parseLatexToDocx(subContent) }));
                    }
                    i = nextIdx;
                } 
                else if (char === '{' || char === '}') {
                    i++; // Bỏ qua ngoặc đơn lẻ dùng để gom nhóm
                } 
                else {
                    // Ký tự thường
                    children.push(new MathRun(char));
                    i++;
                }
            }
            return children;
        }

        // Helper: Lấy nội dung trong ngoặc {} hoặc []
        function extractGroup(str, startIndex, openChar = '{', closeChar = '}') {
            let depth = 0;
            let i = startIndex;
            
            // Tìm ký tự mở đầu tiên
            while(i < str.length && str[i] !== openChar) {
                // Nếu gặp ký tự khác (không phải khoảng trắng) trước khi gặp mở ngoặc -> coi là nhóm 1 ký tự
                if (str[i] !== ' ') return { content: str[i], nextIndex: i + 1 }; 
                i++;
            }
            
            if (i >= str.length) return { content: "", nextIndex: startIndex };
            
            i++; // Qua dấu mở
            depth = 1;
            let startContent = i;
            
            while (i < str.length && depth > 0) {
                if (str[i] === openChar) depth++;
                else if (str[i] === closeChar) depth--;
                i++;
            }
            
            return {
                content: str.substring(startContent, i - 1),
                nextIndex: i
            };
        }

        // --- 2. HÀM TẠO ĐOẠN VĂN (Hỗ trợ Text lẫn Math) ---
        function createPara(text, options = {}) {
            const children = [];
            // Tách các đoạn Math ($$...$$) và Text thường
            const parts = text.split(/(\$\$[\s\S]*?\$\$)/g);

            parts.forEach(part => {
                if (part.startsWith('$$') && part.endsWith('$$')) {
                    // Xử lý Toán
                    const latex = part.slice(2, -2).trim(); 
                    const mathRuns = parseLatexToDocx(latex);
                    children.push(new DocxMath({ children: mathRuns }));
                } else {
                    // Xử lý Text thường
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = part.replace(/\n/g, ' '); 
                    
                    function traverse(node, style) {
                        if (node.nodeType === 3) {
                            if(node.nodeValue) children.push(new TextRun({ text: node.nodeValue, ...style }));
                        } else if (node.nodeType === 1) {
                            const tag = node.tagName.toLowerCase();
                            if(tag === 'br') children.push(new TextRun({ text: "\n", break: 1 }));
                            else {
                                const newStyle = { ...style, bold: style.bold || tag==='b'||tag==='strong', italics: style.italics || tag==='i'||tag==='em' };
                                Array.from(node.childNodes).forEach(c => traverse(c, newStyle));
                            }
                        }
                    }
                    traverse(tempDiv, { bold: options.bold, italics: options.italics });
                }
            });

            return new Paragraph({
                children: children,
                alignment: options.alignment || AlignmentType.LEFT,
                heading: options.heading,
                spacing: { after: 100 }
            });
        }

        // --- 3. HÀM TẠO BẢNG ---
        function createTable(tableNode) {
            const rows = Array.from(tableNode.querySelectorAll('tr')).map(tr => {
                const cells = Array.from(tr.querySelectorAll('td, th')).map(td => {
                    const isHeader = td.tagName.toLowerCase() === 'th';
                    return new TableCell({
                        children: [createPara(td.innerHTML, { bold: isHeader, alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT })],
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
            return new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } });
        }

        // --- 4. MAIN PROCESS ---
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
                    docChildren.push(createTable(node));
                    docChildren.push(new Paragraph(""));
                } 
                else if (tag.match(/^h[1-6]$/)) {
                    docChildren.push(createPara(node.innerHTML, { heading: HeadingLevel.HEADING_2, bold: true }));
                }
                else if (['p', 'div', 'li'].includes(tag)) {
                    docChildren.push(createPara(node.innerHTML));
                }
                else {
                    docChildren.push(createPara(node.innerText));
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
