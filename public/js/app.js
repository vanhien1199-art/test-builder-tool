// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo
    addTopic();

    // 2. Gán sự kiện
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const btnAddTopic = document.getElementById('btnAddTopic');
    const examTypeSelect = document.getElementById('exam_type');
    
    if (btnAddTopic) btnAddTopic.addEventListener('click', addTopic);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);

    // 3. Logic ẩn hiện ô nhập tiết
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', updatePeriodInputs);
        setTimeout(updatePeriodInputs, 100); 
    }

    // 4. Sự kiện ủy quyền (Event Delegation)
    document.getElementById('topics-container').addEventListener('click', function(e) {
        const target = e.target;
        if (target.closest('.remove-topic-btn')) {
            if(confirm("Xóa chương này?")) target.closest('.topic-wrapper').remove();
        } else if (target.closest('.btn-add-unit')) {
            addUnit(target.closest('.topic-wrapper').querySelector('.units-container'));
        } else if (target.closest('.remove-unit-btn')) {
            target.closest('.unit-item').remove();
        }
    });
});

// --- CÁC HÀM GIAO DIỆN (UI) ---
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

// --- HÀM TẠO DỮ LIỆU ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const sec = document.getElementById('previewSection');
    const prev = document.getElementById('previewContent');

    loading.classList.remove('hidden'); error.innerText = ""; sec.classList.add('hidden'); prev.innerHTML = ""; btn.disabled = true;

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
        
        // Clean HTML cơ bản
        let cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();
        // Fix hiển thị Web
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

// ============================================================
// --- LOGIC XUẤT WORD CAO CẤP (XỬ LÝ MỌI LOẠI THẺ HTML) ---
// ============================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    if (typeof docx === 'undefined') { alert("Thư viện lỗi. F5 lại trang!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerText;
    btn.innerText = "Đang tạo file..."; btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, BorderStyle, HeadingLevel, AlignmentType } = window.docx;

        // 1. Convert MathML XML -> Docx Math
        function convertXmlNode(node) {
            if (!node) return [];
            const results = [];
            node.childNodes.forEach(child => {
                if (child.nodeType === 3) { if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue)); return; }
                const tag = child.tagName.toLowerCase();
                const children = convertXmlNode(child);
                switch (tag) {
                    case 'mn': case 'mi': case 'mo': case 'mtext': results.push(new MathRun(child.textContent)); break;
                    case 'mfrac': if (children.length >= 2) results.push(new MathFraction({ numerator: [children[0]], denominator: [children[1]] })); break;
                    case 'msup': if (children.length >= 2) results.push(new MathSuperScript({ children: [children[0]], superScript: [children[1]] })); break;
                    case 'msub': if (children.length >= 2) results.push(new MathSubScript({ children: [children[0]], subScript: [children[1]] })); break;
                    case 'msqrt': results.push(new MathRadical({ children: children })); break;
                    case 'mrow': case 'mstyle': results.push(...children); break;
                    default: results.push(...children); break;
                }
            });
            return results;
        }

        // 2. HÀM QUAN TRỌNG: Phân tích Node Text & Style (In đậm, nghiêng, Toán)
        function getRunsFromNode(node, style = {}) {
            let runs = [];
            if (node.nodeType === 3) { // TEXT NODE
                const text = node.nodeValue;
                if (!text) return [];
                // Tách LaTeX $$..$$
                const parts = text.split(/(\$\$[\s\S]*?\$\$)/g);
                parts.forEach(part => {
                    if (part.startsWith('$$') && part.endsWith('$$')) {
                        const latex = part.slice(2, -2);
                        try {
                            if (typeof temml !== 'undefined') {
                                const xml = temml.renderToString(latex, { xml: true });
                                const mathRoot = new DOMParser().parseFromString(xml, "text/xml").documentElement;
                                runs.push(new MathObj({ children: convertXmlNode(mathRoot) }));
                            } else { runs.push(new TextRun({ text: part, color: "2E75B6" })); }
                        } catch(e) { runs.push(new TextRun({ text: part, color: "FF0000" })); }
                    } else {
                        if (part) {
                            let cleanPart = part.replace(/\n/g, " "); // Xóa xuống dòng thừa của HTML
                            runs.push(new TextRun({ text: cleanPart, bold: style.bold, italics: style.italic, break: style.break ? 1 : 0 }));
                            style.break = false;
                        }
                    }
                });
            } else if (node.nodeType === 1) { // ELEMENT NODE
                const tag = node.tagName.toLowerCase();
                const newStyle = { ...style };
                if (tag === 'b' || tag === 'strong') newStyle.bold = true;
                if (tag === 'i' || tag === 'em') newStyle.italic = true;
                if (tag === 'br') runs.push(new TextRun({ text: "", break: 1 })); // Xuống dòng cứng
                
                node.childNodes.forEach(child => {
                    runs = runs.concat(getRunsFromNode(child, newStyle));
                });
            }
            return runs;
        }

        // 3. HÀM QUAN TRỌNG NHẤT: Chuyển đổi khối HTML bất kỳ thành mảng Docx Element (Paragraph/Table)
        function processHtmlToDocx(childNodes) {
            const docElements = [];
            let currentRuns = [];

            function flushRuns(opts = {}) {
                if (currentRuns.length > 0) {
                    docElements.push(new Paragraph({ children: [...currentRuns], ...opts }));
                    currentRuns = [];
                }
            }

            Array.from(childNodes).forEach(node => {
                if (node.nodeType === 1) { // Element Node
                    const tag = node.tagName.toLowerCase();

                    // --- XỬ LÝ BẢNG ---
                    if (tag === 'table') {
                        flushRuns(); // Kết thúc đoạn văn trước đó nếu có
                        const rows = Array.from(node.querySelectorAll('tr')).map(tr => 
                            new TableRow({ children: Array.from(tr.querySelectorAll('td, th')).map(td => {
                                const colSpan = td.getAttribute('colspan');
                                const rowSpan = td.getAttribute('rowspan');
                                // Đệ quy: Parse nội dung trong ô bảng
                                const cellElements = processHtmlToDocx(td.childNodes);
                                // TableCell chỉ nhận Paragraph, không nhận Table lồng nhau ở level này (đơn giản hóa)
                                // Lọc chỉ lấy Paragraphs từ kết quả đệ quy
                                const cellParas = cellElements.filter(el => el instanceof Paragraph);
                                if(cellParas.length === 0) cellParas.push(new Paragraph(""));

                                return new TableCell({ 
                                    children: cellParas,
                                    columnSpan: colSpan ? parseInt(colSpan) : 1,
                                    rowSpan: rowSpan ? parseInt(rowSpan) : 1,
                                    width: { size: 100, type: WidthType.PERCENTAGE }, 
                                    borders: {top:{style:BorderStyle.SINGLE, size:1}, bottom:{style:BorderStyle.SINGLE, size:1}, left:{style:BorderStyle.SINGLE, size:1}, right:{style:BorderStyle.SINGLE, size:1}} 
                                }); 
                            })})
                        );
                        docElements.push(new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                        docElements.push(new Paragraph("")); // Cách dòng sau bảng
                    } 
                    // --- XỬ LÝ TIÊU ĐỀ ---
                    else if (tag.match(/^h[1-6]$/)) {
                        flushRuns();
                        const runs = getRunsFromNode(node);
                        docElements.push(new Paragraph({
                            children: runs,
                            heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }
                        }));
                    }
                    // --- XỬ LÝ ĐOẠN VĂN (P, DIV, LI) ---
                    else if (['p', 'div', 'li', 'ul', 'ol'].includes(tag)) {
                        flushRuns();
                        // Nếu là div/p chứa text trực tiếp -> Tạo paragraph
                        // Nếu div chứa div khác -> Đệ quy tiếp
                        // Ở đây ta dùng getRunsFromNode để "làm phẳng" nội dung bên trong thành 1 đoạn văn
                        // Đây là cách an toàn nhất để lấy A. B. C. D.
                        const runs = getRunsFromNode(node);
                        if (runs.length > 0) {
                            docElements.push(new Paragraph({ children: runs, spacing: { after: 50 } }));
                        }
                    }
                    // --- CÁC THẺ KHÁC (SPAN, B, I...) ---
                    else {
                        // Gom vào đoạn văn hiện tại
                        const runs = getRunsFromNode(node);
                        currentRuns.push(...runs);
                    }
                } 
                else if (node.nodeType === 3) { // Text Node trôi nổi
                    const runs = getRunsFromNode(node);
                    currentRuns.push(...runs);
                }
            });

            flushRuns(); // Đẩy nốt đoạn văn cuối
            return docElements;
        }

        // 4. Xây dựng Document
        const parser = new DOMParser();
        // Bọc trong div để đảm bảo parse được hết
        const docHTML = parser.parseFromString(`<div>${window.generatedHTML}</div>`, 'text/html');
        
        // Header
        const headerPara = new Paragraph({ 
            text: "ĐỀ KIỂM TRA & MA TRẬN", 
            heading: HeadingLevel.HEADING_1, 
            alignment: AlignmentType.CENTER, 
            spacing: { after: 300 },
            run: { font: "Times New Roman", size: 28, bold: true }
        });

        // Xử lý toàn bộ nội dung
        const rootDiv = docHTML.body.firstElementChild || docHTML.body;
        const generatedElements = processHtmlToDocx(rootDiv.childNodes);

        const doc = new Document({ sections: [{ children: [headerPara, ...generatedElements] }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Final_${Date.now()}.docx`);

    } catch(e) { alert("Lỗi xuất file: " + e.message); console.error(e); } 
    finally { btn.innerText = oldText; btn.disabled = false; }
}
// GÁN SỰ KIỆN CHO NÚT COPY MỚI
    const btnCopy = document.getElementById('btnCopy');
    if (btnCopy) {
        btnCopy.addEventListener('click', handleCopyContent);
    }
});

// ... (Các hàm cũ giữ nguyên) ...

// --- HÀM XỬ LÝ COPY CHUYÊN NGHIỆP ---
async function handleCopyContent() {
    const content = document.getElementById('previewContent');
    const btn = document.getElementById('btnCopy');
    const originalHtml = btn.innerHTML; // Lưu lại icon cũ

    if (!content || !content.innerHTML.trim()) {
        alert("Chưa có nội dung để sao chép!");
        return;
    }

    try {
        // Cách 1: Sử dụng Clipboard API hiện đại (Hỗ trợ tốt HTML)
        const type = "text/html";
        const blob = new Blob([windowGeneratedHTML], { type });
        const data = [new ClipboardItem({ [type]: blob })];
        await navigator.clipboard.write(data);

        // Hiệu ứng thành công
        showCopySuccess(btn);

    } catch (err) {
        // Cách 2: Fallback (Dự phòng) nếu trình duyệt chặn API trên (ví dụ Firefox cũ)
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(content);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('copy');
            selection.removeAllRanges();
            
            showCopySuccess(btn);
        } catch (e) {
            console.error("Copy failed", e);
            alert("Lỗi: Không thể sao chép tự động. Vui lòng bôi đen và nhấn Ctrl+C.");
        }
    }
}

// Hàm hiệu ứng nút bấm
function showCopySuccess(btn) {
    // Đổi giao diện nút sang màu xanh
    btn.classList.add('copied');
    btn.innerHTML = `<i class="fas fa-check"></i> <span>Đã chép!</span>`;

    // Sau 2 giây trả về như cũ
    setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `<i class="fas fa-copy"></i> <span>Sao chép</span>`;
    }, 2000);
}
