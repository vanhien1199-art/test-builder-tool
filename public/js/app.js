// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo: Thêm 1 chủ đề mặc định
    addTopic();

    // 2. Gán sự kiện cho các nút chính
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const btnAddTopic = document.getElementById('btnAddTopic');
    const examTypeSelect = document.getElementById('exam_type');
    
    if (btnAddTopic) btnAddTopic.addEventListener('click', addTopic);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);

    // 3. Logic ẩn hiện ô nhập tiết (Kích hoạt khi thay đổi loại kiểm tra)
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', updatePeriodInputs);
        // Kích hoạt ngay lần đầu để đồng bộ giao diện
        setTimeout(updatePeriodInputs, 100); 
    }

    // 4. Sự kiện ủy quyền (Event Delegation) cho các nút động
    document.getElementById('topics-container').addEventListener('click', function(e) {
        const target = e.target;
        
        // Nút Xóa Chủ đề lớn (Cha)
        const btnRemoveTopic = target.closest('.remove-topic-btn');
        if (btnRemoveTopic) {
            if(confirm("Bạn có chắc muốn xóa toàn bộ Chương/Chủ đề này?")) {
                btnRemoveTopic.closest('.topic-wrapper').remove();
            }
            return;
        }
        
        // Nút Thêm Đơn vị kiến thức (Con)
        const btnAddUnit = target.closest('.btn-add-unit');
        if (btnAddUnit) {
            const topicWrapper = btnAddUnit.closest('.topic-wrapper');
            addUnit(topicWrapper.querySelector('.units-container'));
            return;
        }

        // Nút Xóa Đơn vị kiến thức (Con)
        const btnRemoveUnit = target.closest('.remove-unit-btn');
        if (btnRemoveUnit) {
            btnRemoveUnit.closest('.unit-item').remove();
            return;
        }
    });
});

// --- HÀM ẨN HIỆN Ô NHẬP TIẾT (LOGIC MỚI BẠN YÊU CẦU) ---
function updatePeriodInputs() {
    const type = document.getElementById('exam_type').value; // 'gk' hoặc 'hk'
    
    // Quét qua tất cả các dòng Unit đang có
    document.querySelectorAll('.unit-item').forEach(item => {
        const div1 = item.querySelector('.hk-input-1');
        const input1 = item.querySelector('.unit-p1');
        const div2 = item.querySelector('.hk-input-2');

        if (type === 'hk') {
            // CHẾ ĐỘ CUỐI KÌ: Hiện cả 2 ô
            div1.classList.remove('hidden');
            input1.placeholder = "Tiết (Đầu)";
            div2.classList.remove('hidden');
        } else {
            // CHẾ ĐỘ GIỮA KÌ: Hiện ô 1 (làm Tổng tiết), Ẩn ô 2
            div1.classList.remove('hidden');
            input1.placeholder = "Tổng tiết"; // Đổi nhãn cho dễ hiểu
            div2.classList.add('hidden');
        }
    });
}

// --- HÀM THÊM CHỦ ĐỀ (CHA) ---
function addTopic() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (!container || !template) return;

    const clone = template.content.cloneNode(true);
    
    // Thêm sẵn 1 dòng con mặc định cho chủ đề mới
    const unitsContainer = clone.querySelector('.units-container');
    container.appendChild(clone);
    
    // Thêm ngay 1 bài học con vào chủ đề vừa tạo
    addUnit(unitsContainer);
}

// --- HÀM THÊM ĐƠN VỊ KIẾN THỨC (CON) ---
function addUnit(container) {
    const template = document.getElementById('unit-template');
    if (!container || !template) return;

    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
    
    // Cập nhật lại trạng thái ẩn hiện số tiết cho dòng mới thêm
    updatePeriodInputs();
}

// --- HÀM XỬ LÝ GỬI DỮ LIỆU (LOGIC NESTED + BOOK SERIES) ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const sec = document.getElementById('previewSection');
    const prev = document.getElementById('previewContent');

    // UI Reset
    loading.classList.remove('hidden'); 
    error.classList.add('hidden'); 
    error.innerHTML = "";
    sec.classList.add('hidden'); 
    prev.innerHTML = ""; 
    btn.disabled = true;

    try {
        const get = id => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : "";
        };
        
        // 1. Kiểm tra License Key
        const licenseKey = get('license_key');
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        // 2. Thu thập dữ liệu LỒNG NHAU & Tính tổng tiết
        const topicsData = [];
        let totalP1 = 0; // Tổng tiết nửa đầu (hoặc tổng tiết GK)
        let totalP2 = 0; // Tổng tiết nửa sau

        // Duyệt từng Chủ đề lớn (Wrapper)
        document.querySelectorAll('.topic-wrapper').forEach(topicEl => {
            const topicName = topicEl.querySelector('.topic-name').value.trim();
            if (!topicName) return; // Bỏ qua nếu tên chương rỗng

            const units = [];
            // Duyệt từng Đơn vị con trong chủ đề đó
            topicEl.querySelectorAll('.unit-item').forEach(unitEl => {
                const content = unitEl.querySelector('.unit-content').value.trim();
                
                // Lấy số tiết (nếu có)
                const p1Input = unitEl.querySelector('.unit-p1');
                const p2Input = unitEl.querySelector('.unit-p2');
                const p1 = p1Input ? (parseInt(p1Input.value) || 0) : 0;
                const p2 = p2Input ? (parseInt(p2Input.value) || 0) : 0;

                if (content) {
                    units.push({ content, p1, p2 });
                    // Cộng dồn vào tổng
                    totalP1 += p1;
                    totalP2 += p2;
                }
            });

            if (units.length > 0) {
                topicsData.push({
                    name: topicName,
                    units: units // Mảng con chứa các bài học
                });
            }
        });

        if (topicsData.length === 0) throw new Error("Vui lòng nhập ít nhất 1 Chương và 1 Bài học!");

        // 3. Đóng gói dữ liệu gửi đi (Kèm BOOK SERIES)
        const requestData = {
            license_key: licenseKey, 
            subject: get('subject'), 
            grade: get('grade'),
            book_series: document.getElementById('book_series').value, // Lấy tên bộ sách
            semester: get('semester'), 
            exam_type: get('exam_type'), 
            time: get('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: totalP1, // Tổng tự tính
            totalPeriodsHalf2: totalP2,
            topics: topicsData // Cấu trúc mới: Mảng lồng nhau
        };

        // 4. Gọi API
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

        // 5. Stream & Render
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
        
        // Làm sạch HTML (chỉ xóa markdown, giữ nguyên thẻ HTML)
        let cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();
        
        // Mẹo nhỏ: Thêm <br> trước các đáp án B,C,D nếu dính liền để hiển thị đẹp trên Web
        // (Word dùng Logic DOM Parser riêng nên không bị ảnh hưởng)
        cleanHTML = cleanHTML.replace(/(\s+)(B\.|C\.|D\.)/g, '<br><b>$2</b>').replace(/(A\.)/g, '<b>$1</b>');

        prev.innerHTML = cleanHTML;
        window.generatedHTML = cleanHTML;
        
        sec.classList.remove('hidden'); 
        sec.scrollIntoView({behavior:'smooth'});

    } catch(e) { 
        error.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${e.message}`; 
        error.classList.remove('hidden'); 
    } finally { 
        loading.classList.add('hidden'); 
        btn.disabled = false; 
    }
}

// ============================================================
// --- LOGIC XUẤT WORD "THẦN THÁNH" (DOM TRAVERSAL - KHÔNG MẤT CHỮ) ---
// ============================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    
    // Kiểm tra thư viện
    if (typeof docx === 'undefined') {
        alert("Lỗi: Thư viện DOCX chưa tải xong. Vui lòng F5."); return;
    }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang xử lý...`; 
    btn.disabled = true;

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
                    case 'mn': case 'mi': case 'mo': case 'mtext': 
                        results.push(new MathRun(child.textContent)); break;
                    case 'mfrac': 
                        if (children.length >= 2) results.push(new MathFraction({ numerator: [children[0]], denominator: [children[1]] })); break;
                    case 'msup': 
                        if (children.length >= 2) results.push(new MathSuperScript({ children: [children[0]], superScript: [children[1]] })); break;
                    case 'msub': 
                        if (children.length >= 2) results.push(new MathSubScript({ children: [children[0]], subScript: [children[1]] })); break;
                    case 'msqrt': 
                        results.push(new MathRadical({ children: children })); break;
                    case 'mrow': case 'mstyle': 
                        results.push(...children); break; 
                    default: 
                        results.push(...children); break;
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
                            // Thay thế ký tự xuống dòng của HTML thành dấu cách (trừ khi có thẻ br)
                            let cleanPart = part.replace(/\n/g, " "); 
                            runs.push(new TextRun({
                                text: cleanPart,
                                bold: style.bold,
                                italics: style.italic,
                                break: style.break ? 1 : 0
                            }));
                            style.break = false; // Reset break
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
            }
            return runs;
        }

        // 3. Hàm chuyển HTML String thành mảng Paragraphs DOCX
        function parseToParagraphs(htmlContent) {
            const paragraphs = [];
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;

            // Duyệt qua các node con trực tiếp
            Array.from(tempDiv.childNodes).forEach(node => {
                const runs = getRunsFromNode(node);
                if (runs.length > 0) {
                    paragraphs.push(new Paragraph({ children: runs }));
                }
            });
            
            if (paragraphs.length === 0) return [new Paragraph("")];
            return paragraphs;
        }

        // 4. Xây dựng Document
        const parser = new DOMParser();
        // Bọc trong div để đảm bảo parse được hết
        const docHTML = parser.parseFromString(`<div>${window.generatedHTML}</div>`, 'text/html');
        
        const docChildren = [
            new Paragraph({ 
                text: "ĐỀ KIỂM TRA", 
                heading: HeadingLevel.HEADING_1, 
                alignment: AlignmentType.CENTER, 
                spacing: { after: 300 },
                run: { font: "Times New Roman", size: 28, bold: true }
            })
        ];

        // Duyệt nội dung từ div ảo
        const rootNode = docHTML.body.firstElementChild || docHTML.body;

        Array.from(rootNode.childNodes).forEach(el => {
            // Chỉ xử lý Element Node (1) hoặc Text Node (3) có nội dung
            if (el.nodeType === 3 && !el.nodeValue.trim()) return;

            const tagName = el.tagName ? el.tagName.toUpperCase() : "";
            
            if (tagName.match(/^H[1-6]$/)) {
                // Tiêu đề
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
                // Các thẻ khác (div, p, ul...) -> Coi là đoạn văn
                // Sử dụng parseToParagraphs để xử lý các block con bên trong
                if (el.innerHTML) {
                    const paras = parseToParagraphs(el.innerHTML);
                    docChildren.push(...paras);
                }
            }
        });

        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Final_Pro_${Date.now()}.docx`);

    } catch(e) { alert("Lỗi xuất file: " + e.message); console.error(e); } 
    finally { btn.innerHTML = originalText; btn.disabled = false; }
}
