// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo
    addTopic();

    // 2. Gán sự kiện
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const examTypeSelect = document.getElementById('exam_type');

    if (btnAdd) btnAdd.addEventListener('click', addTopic);
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

// --- CÁC HÀM UI ---
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
    container.appendChild(clone);
    addUnit(container.lastElementChild.querySelector('.units-container'));
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
        
        // Làm sạch cơ bản: Xóa markdown code block
        let cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();
        
        // Hỗ trợ hiển thị đẹp trên Web (Thêm xuống dòng cho trắc nghiệm nếu dính liền)
        // Lưu ý: Việc này chỉ ảnh hưởng hiển thị Web, còn Word sẽ dùng DOM Parser bên dưới
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
// --- LOGIC XUẤT WORD (SỬ DỤNG DOM PARSER - KHÔNG DÙNG REGEX XÓA THẺ) ---
// ============================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    if (typeof docx === 'undefined') { alert("Thư viện lỗi. Vui lòng tải lại trang!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerText;
    btn.innerText = "Đang xử lý..."; btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, BorderStyle, HeadingLevel, AlignmentType } = window.docx;

        // 1. Hàm chuyển đổi MathML XML -> Docx Math
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

        // 2. HÀM QUAN TRỌNG: Duyệt cây DOM để lấy nội dung (Thay thế Regex cũ)
        // Hàm này sẽ đi qua từng node HTML, giữ lại text và style, bỏ qua thẻ rác
        function processHtmlNodes(childNodes) {
            const paragraphs = [];
            let currentRuns = [];

            // Hàm đẩy đoạn văn hiện tại vào danh sách và reset
            function flushRuns() {
                if (currentRuns.length > 0) {
                    paragraphs.push(new Paragraph({ children: [...currentRuns] }));
                    currentRuns = [];
                }
            }

            // Hàm đệ quy duyệt node
            function traverse(node, style = {}) {
                if (node.nodeType === 3) { // Text Node (Đây là nơi lấy nội dung chữ)
                    const text = node.nodeValue;
                    if (!text) return;

                    // Tách LaTeX $$...$$ để xử lý riêng
                    const parts = text.split(/(\$\$[\s\S]*?\$\$)/g);
                    parts.forEach(part => {
                        if (part.startsWith('$$') && part.endsWith('$$')) {
                            // Xử lý Toán
                            const latex = part.slice(2, -2);
                            try {
                                if (typeof temml !== 'undefined') {
                                    const xml = temml.renderToString(latex, { xml: true });
                                    const mathRoot = new DOMParser().parseFromString(xml, "text/xml").documentElement;
                                    currentRuns.push(new MathObj({ children: convertXmlNode(mathRoot) }));
                                } else {
                                    currentRuns.push(new TextRun({ text: part, color: "2E75B6" }));
                                }
                            } catch(e) { currentRuns.push(new TextRun({ text: part, color: "FF0000" })); }
                        } else {
                            // Xử lý Text thường (Giữ style Bold/Italic từ cha)
                            if (part) {
                                // Xử lý các ký tự đặc biệt xuống dòng
                                let cleanPart = part.replace(/\n/g, " "); 
                                currentRuns.push(new TextRun({
                                    text: cleanPart,
                                    bold: style.bold,
                                    italics: style.italic,
                                    break: style.break ? 1 : 0
                                }));
                                style.break = false; // Reset break sau khi dùng
                            }
                        }
                    });

                } else if (node.nodeType === 1) { // Element Node (Thẻ HTML)
                    const tag = node.tagName.toLowerCase();
                    const newStyle = { ...style };

                    // Áp dụng Style
                    if (tag === 'b' || tag === 'strong') newStyle.bold = true;
                    if (tag === 'i' || tag === 'em') newStyle.italic = true;
                    
                    // Xử lý xuống dòng: <br>
                    if (tag === 'br') {
                        currentRuns.push(new TextRun({ text: "", break: 1 }));
                    }
                    
                    // Xử lý Block: <p>, <div>, <li> -> Ngắt đoạn
                    if (tag === 'p' || tag === 'div' || tag === 'li') {
                        if (currentRuns.length > 0) flushRuns(); 
                    }

                    // Duyệt đệ quy vào các con
                    node.childNodes.forEach(child => traverse(child, newStyle));

                    // Sau khi đóng thẻ block, ngắt đoạn tiếp
                    if (tag === 'p' || tag === 'div' || tag === 'li' || tag === 'tr') {
                        flushRuns();
                    }
                }
            }

            // Bắt đầu duyệt danh sách node đầu vào
            Array.from(childNodes).forEach(child => traverse(child));
            
            // Đẩy nốt những gì còn lại
            flushRuns();
            
            // Fallback: Nếu rỗng thì trả về 1 dòng trống để giữ chỗ
            if (paragraphs.length === 0) return [new Paragraph("")];

            return paragraphs;
        }

        // --- 3. BUILD DOC ---
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        
        // Luôn thêm Tiêu đề "ĐỀ KIỂM TRA" ở đầu
        const docChildren = [
            new Paragraph({ 
                text: "ĐỀ KIỂM TRA", 
                heading: HeadingLevel.HEADING_1, 
                alignment: AlignmentType.CENTER, 
                spacing: { after: 300 },
                run: { font: "Times New Roman", size: 28, bold: true }
            })
        ];

        // Duyệt body HTML
        Array.from(docHTML.body.children).forEach(el => {
            const tagName = el.tagName;
            
            if (tagName.match(/^H[1-6]$/)) {
                // Tiêu đề con (Phần I, Phần II...)
                const paras = processHtmlNodes(el.childNodes);
                paras.forEach(p => {
                    docChildren.push(new Paragraph({
                        heading: HeadingLevel.HEADING_2,
                        children: p.root.children, // Copy nội dung run
                        spacing: { before: 200, after: 100 }
                    }));
                });
            } else if (tagName === 'TABLE') {
                // Bảng
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => 
                    new TableRow({ children: Array.from(tr.querySelectorAll('td, th')).map(td => {
                        const colSpan = td.getAttribute('colspan');
                        const rowSpan = td.getAttribute('rowspan');
                        
                        // QUAN TRỌNG: Dùng processHtmlNodes để parse nội dung ô (Giữ chữ, công thức, xuống dòng)
                        const cellParas = processHtmlNodes(td.childNodes);

                        // Mặc định TableCell yêu cầu children là mảng Paragraph
                        // Nếu cellParas rỗng, thêm 1 paragraph trống
                        if (cellParas.length === 0) cellParas.push(new Paragraph(""));

                        return new TableCell({ 
                            children: cellParas,
                            columnSpan: colSpan ? parseInt(colSpan) : 1,
                            rowSpan: rowSpan ? parseInt(rowSpan) : 1,
                            width: { size: 100, type: WidthType.PERCENTAGE }, 
                            borders: {top:{style:BorderStyle.SINGLE, size:1}, bottom:{style:BorderStyle.SINGLE, size:1}, left:{style:BorderStyle.SINGLE, size:1}, right:{style:BorderStyle.SINGLE, size:1}} 
                        }); 
                    })})
                );
                docChildren.push(new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                docChildren.push(new Paragraph(""));
            } else {
                // Các thẻ block khác (div, p, ul...) bên ngoài bảng
                // Dùng processHtmlNodes để lấy hết nội dung
                const paras = processHtmlNodes(el.childNodes);
                docChildren.push(...paras);
            }
        });

        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Final_${Date.now()}.docx`);

    } catch(e) { alert("Lỗi xuất file: " + e.message); console.error(e); } 
    finally { btn.innerText = oldText; btn.disabled = false; }
}
