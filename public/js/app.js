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

    // 3. Logic ẩn hiện ô nhập tiết (Học kì/Giữa kì)
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', updatePeriodInputs);
        setTimeout(updatePeriodInputs, 100); 
    }

    // 4. Sự kiện ủy quyền (Event Delegation)
    document.getElementById('topics-container').addEventListener('click', function(e) {
        const target = e.target;
        // Xóa Chủ đề lớn
        if (target.closest('.remove-topic-btn')) {
            if(confirm("Bạn có chắc muốn xóa toàn bộ Chương này?")) {
                target.closest('.topic-wrapper').remove();
            }
            return;
        }
        // Thêm Unit con
        if (target.closest('.btn-add-unit')) {
            const wrapper = target.closest('.topic-wrapper');
            addUnit(wrapper.querySelector('.units-container'));
            return;
        }
        // Xóa Unit con
        if (target.closest('.remove-unit-btn')) {
            target.closest('.unit-item').remove();
            return;
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
            div1.classList.remove('hidden');
            input1.placeholder = "Tiết (Đầu)";
            div2.classList.remove('hidden');
        } else {
            div1.classList.remove('hidden');
            input1.placeholder = "Tổng tiết";
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
    addUnit(unitsContainer); // Thêm sẵn 1 bài học
}

function addUnit(container) {
    const template = document.getElementById('unit-template');
    if (!container || !template) return;

    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
    updatePeriodInputs();
}

// --- HÀM TẠO DỮ LIỆU (LOGIC MỚI: Nested + Book Series) ---
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

        // 1. Thu thập dữ liệu LỒNG NHAU (Chương -> Bài)
        const topicsData = [];
        let totalP1 = 0;
        let totalP2 = 0;

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
                    totalP1 += p1;
                    totalP2 += p2;
                }
            });

            if (units.length > 0) {
                topicsData.push({ name: topicName, units: units });
            }
        });

        if (topicsData.length === 0) throw new Error("Vui lòng nhập ít nhất 1 Chương và 1 Bài học!");

        // 2. Gửi dữ liệu (Bao gồm BOOK_SERIES)
        const requestData = {
            license_key: get('license_key'), 
            subject: get('subject'), 
            grade: get('grade'),
            book_series: document.getElementById('book_series').value, // Lấy tên bộ sách
            semester: get('semester'), 
            exam_type: get('exam_type'), 
            time: get('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: totalP1,
            totalPeriodsHalf2: totalP2,
            topics: topicsData 
        };

        const res = await fetch('/api_matrix', {
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(requestData)
        });
        
        if(!res.ok) {
            let t = await res.text();
            try { t = JSON.parse(t).error } catch(e){}
            throw new Error(`Lỗi Server: ${t}`);
        }

        // 3. Xử lý Stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
        
        // 4. Clean HTML (Chỉ xóa markdown, giữ nguyên thẻ HTML để Word xử lý)
        let cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();
        
        // Mẹo nhỏ: Thêm <br> trước các đáp án B,C,D để hiển thị đẹp trên Web (Word không ảnh hưởng vì dùng Logic khác)
        cleanHTML = cleanHTML.replace(/(\s+)(B\.|C\.|D\.)/g, '<br><b>$2</b>').replace(/(A\.)/g, '<b>$1</b>');

        prev.innerHTML = cleanHTML;
        window.generatedHTML = cleanHTML;
        
        sec.classList.remove('hidden'); 
        sec.scrollIntoView({behavior:'smooth'});

    } catch(e) { 
        error.innerHTML = e.message; error.classList.remove('hidden'); 
    } finally { 
        loading.classList.add('hidden'); btn.disabled = false; 
    }
}

// ============================================================
// --- LOGIC XUẤT WORD "THẦN THÁNH" (DOM WALKER - KHÔNG MẤT CHỮ) ---
// ============================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    if (typeof docx === 'undefined') { alert("Lỗi: Thư viện DOCX chưa tải xong."); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerText;
    btn.innerText = "Đang xử lý..."; btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, BorderStyle, HeadingLevel, AlignmentType } = window.docx;

        // 1. Chuyển đổi MathML XML -> Docx Math Object
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

        // 2. HÀM DUYỆT CÂY DOM ĐỂ LẤY NỘI DUNG (KEY FUNCTION)
        // Hàm này đi vào từng text node để lấy chữ, không dùng regex xóa thẻ
        function getRunsFromNode(node, style = {}) {
            let runs = [];

            if (node.nodeType === 3) { // Text Node
                const text = node.nodeValue;
                if (!text) return [];

                // Tách công thức Toán ($$..$$)
                const parts = text.split(/(\$\$[\s\S]*?\$\$)/g);
                parts.forEach(part => {
                    if (part.startsWith('$$') && part.endsWith('$$')) {
                        // Xử lý Toán
                        const latex = part.slice(2, -2);
                        try {
                            if (typeof temml !== 'undefined') {
                                const xml = temml.renderToString(latex, { xml: true });
                                const mathRoot = new DOMParser().parseFromString(xml, "text/xml").documentElement;
                                runs.push(new MathObj({ children: convertXmlNode(mathRoot) }));
                            } else {
                                runs.push(new TextRun({ text: part, color: "2E75B6" }));
                            }
                        } catch(e) { runs.push(new TextRun({ text: part, color: "FF0000" })); }
                    } else {
                        // Xử lý Text thường
                        if (part) {
                            // Thay thế ký tự xuống dòng của HTML thành dấu cách để tránh vỡ format
                            let cleanPart = part.replace(/\n/g, " "); 
                            runs.push(new TextRun({
                                text: cleanPart,
                                bold: style.bold,
                                italics: style.italic,
                                break: style.break ? 1 : 0
                            }));
                            style.break = false; // Reset break sau khi dùng
                        }
                    }
                });

            } else if (node.nodeType === 1) { // Element Node
                const tag = node.tagName.toLowerCase();
                const newStyle = { ...style };

                if (tag === 'b' || tag === 'strong') newStyle.bold = true;
                if (tag === 'i' || tag === 'em') newStyle.italic = true;
                if (tag === 'br') {
                    runs.push(new TextRun({ text: "", break: 1 })); // Xuống dòng chuẩn
                }
                
                // Duyệt đệ quy con
                node.childNodes.forEach(child => {
                    runs = runs.concat(getRunsFromNode(child, newStyle));
                });
                
                // Block element (p, div, li) -> Thêm xuống dòng sau khi kết thúc
                if (['p', 'div', 'li', 'tr'].includes(tag)) {
                     // Logic thêm break này xử lý ở tầng Paragraph, nhưng thêm 1 break textrun cũng an toàn
                }
            }
            return runs;
        }

        // 3. Hàm chuyển HTML String thành mảng Paragraphs DOCX
        function parseToParagraphs(htmlContent) {
            const paragraphs = [];
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;

            // Duyệt qua các node con trực tiếp của cell/div
            Array.from(tempDiv.childNodes).forEach(node => {
                const runs = getRunsFromNode(node);
                if (runs.length > 0) {
                    paragraphs.push(new Paragraph({ children: runs }));
                }
            });
            
            // Nếu rỗng (ví dụ ô trống), trả về 1 paragraph rỗng
            if (paragraphs.length === 0) return [new Paragraph("")];
            
            return paragraphs;
        }

        // 4. Xây dựng Document
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        
        // Luôn có tiêu đề
        const docChildren = [
            new Paragraph({ 
                text: "ĐỀ KIỂM TRA", 
                heading: HeadingLevel.HEADING_1, 
                alignment: AlignmentType.CENTER, 
                spacing: { after: 300 },
                run: { font: "Times New Roman", size: 28, bold: true }
            })
        ];

        // Duyệt toàn bộ body HTML
        Array.from(docHTML.body.children).forEach(el => {
            const tagName = el.tagName;
            
            if (tagName.match(/^H[1-6]$/)) {
                // Tiêu đề (H1-H6)
                const runs = getRunsFromNode(el);
                docChildren.push(new Paragraph({
                    children: runs,
                    heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }
                }));
            } else if (tagName === 'TABLE') {
                // Bảng
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => 
                    new TableRow({ children: Array.from(tr.querySelectorAll('td, th')).map(td => {
                        const colSpan = td.getAttribute('colspan');
                        const rowSpan = td.getAttribute('rowspan');
                        
                        // Parse nội dung ô bằng DOM Walker
                        const cellParas = parseToParagraphs(td.innerHTML);

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
                // Các thẻ block khác (div, p, ul...)
                const runs = getRunsFromNode(el);
                if (runs.length > 0) {
                    docChildren.push(new Paragraph({ children: runs }));
                }
            }
        });

        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Final_Pro_${Date.now()}.docx`);

    } catch(e) { alert("Lỗi xuất file: " + e.message); console.error(e); } 
    finally { btn.innerText = oldText; btn.disabled = false; }
}
