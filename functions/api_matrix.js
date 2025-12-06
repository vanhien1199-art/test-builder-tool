// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo: Thêm 1 chủ đề mặc định lúc đầu
    addTopic();

    // 2. Gán sự kiện cho các nút chính
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const btnAddTopic = document.getElementById('btnAddTopic');
    
    if (btnAddTopic) btnAddTopic.addEventListener('click', addTopic);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);

    // 3. Logic ẩn hiện ô nhập tiết (Học kì)
    const examType = document.getElementById('exam_type');
    if (examType) {
        examType.addEventListener('change', updatePeriodInputs);
        // Kích hoạt ngay lần đầu
        setTimeout(updatePeriodInputs, 100); 
    }

    // 4. Sự kiện ủy quyền (Event Delegation) cho các nút động (Xóa, Thêm con)
    document.getElementById('topics-container').addEventListener('click', function(e) {
        const target = e.target;
        
        // Nút Xóa Chủ đề lớn (Cha)
        const btnRemoveTopic = target.closest('.remove-topic-btn');
        if (btnRemoveTopic) {
            if(confirm("Bạn có chắc muốn xóa toàn bộ Chương/Chủ đề này?")) {
                btnRemoveTopic.closest('.topic-wrapper').remove();
                // Cập nhật lại tổng tiết (nếu cần hiển thị realtime)
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

// --- HÀM ẨN HIỆN Ô NHẬP TIẾT ---
function updatePeriodInputs() {
    const isHK = document.getElementById('exam_type').value === 'hk';
    
    // Tìm tất cả các ô nhập tiết 1 và tiết 2 trên toàn màn hình
    document.querySelectorAll('.hk-input-1, .hk-input-2').forEach(div => {
        if (isHK) div.classList.remove('hidden');
        else div.classList.add('hidden');
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

// --- HÀM XỬ LÝ GỬI DỮ LIỆU (LOGIC MỚI: QUÉT CẤU TRÚC LỒNG NHAU) ---
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
        const get = id => document.getElementById(id).value.trim();
        
        // 1. Kiểm tra License Key
        const licenseKey = get('license_key');
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        // 2. Thu thập dữ liệu LỒNG NHAU & Tính tổng tiết
        const topicsData = [];
        let totalP1 = 0; // Tổng tiết nửa đầu
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

        // 3. Đóng gói dữ liệu gửi đi
        const requestData = {
            license_key: licenseKey, 
            subject: get('subject'), 
            grade: get('grade'),
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
        
        // Làm sạch HTML (chỉ xóa markdown, giữ nội dung)
        const cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();
        
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
// --- LOGIC XUẤT WORD "NATIVE EQUATION" (GIỮ NGUYÊN TỪ PHIÊN BẢN TRƯỚC) ---
// ============================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    
    // Kiểm tra thư viện
    if (typeof docx === 'undefined') {
        alert("Lỗi: Thư viện DOCX chưa tải xong. Vui lòng F5."); return;
    }

    const btn = document.getElementById('btnDownloadWord');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tạo file...`; 
    btn.disabled = true;

    try {
        // Lấy từ biến Global window.docx
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, BorderStyle, HeadingLevel, AlignmentType } = window.docx;
        
        const getHeadingLevel = (tag) => {
            const map = { 'H1': HeadingLevel.HEADING_1, 'H2': HeadingLevel.HEADING_2, 'H3': HeadingLevel.HEADING_3, 'H4': HeadingLevel.HEADING_4, 'H5': HeadingLevel.HEADING_5, 'H6': HeadingLevel.HEADING_6 };
            return map[tag] || HeadingLevel.NORMAL;
        };

        // 1. Hàm đệ quy: XML Node (Temml) -> Docx Math Object
        function convertXmlNode(node) {
            if (!node) return [];
            const results = [];
            node.childNodes.forEach(child => {
                if (child.nodeType === 3) { // Text Node
                    if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue)); return; 
                }
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
                    case 'mroot':
                        if (children.length >= 2) results.push(new MathRadical({ children: [children[0]], degree: [children[1]] })); break;
                    case 'mrow': case 'mstyle': 
                        results.push(...children); break; // Gộp nhóm
                    default: 
                        results.push(...children); break;
                }
            });
            return results;
        }

        // 2. Parse HTML & LaTeX
        function parseContent(htmlText) {
            const parts = htmlText.split(/\$\$(.*?)\$\$/g);
            const runs = [];
            parts.forEach((part, index) => {
                if (index % 2 === 1) { // LaTeX -> Equation
                    try {
                        if (typeof temml !== 'undefined') {
                            const xmlString = temml.renderToString(part, { xml: true });
                            const parser = new DOMParser();
                            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
                            const mathRoot = xmlDoc.getElementsByTagName("math")[0];
                            const mathChildren = convertXmlNode(mathRoot);
                            runs.push(new MathObj({ children: mathChildren }));
                        } else {
                            runs.push(new TextRun({ text: part, bold: true, color: "2E75B6" }));
                        }
                    } catch (e) { 
                        runs.push(new TextRun({ text: `(Lỗi CT: ${part})`, color: "FF0000" })); 
                    }
                } else { // Text thường
                    const cleanText = part.replace(/<[^>]*>?/gm, " ").replace(/&nbsp;/g, " ");
                    if (cleanText.trim()) runs.push(new TextRun(cleanText));
                }
            });
            return [new Paragraph({ children: runs })];
        }

        // 3. Xây dựng Document
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const docChildren = [
            new Paragraph({ text: "ĐỀ KIỂM TRA", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 300 } })
        ];

        const docBodyChildren = Array.from(docHTML.body.children);
        
        docBodyChildren.forEach(el => {
            const tagName = el.tagName;
            const innerHTML = el.innerHTML;
            
            // Xử lý Tiêu đề
            if (tagName.match(/^H[1-6]$/)) {
                docChildren.push(new Paragraph({
                    children: parseContent(innerHTML)[0].root.children, 
                    heading: getHeadingLevel(tagName),
                    alignment: AlignmentType.LEFT,
                    spacing: { before: 200, after: 100 }
                }));
            } 
            // Xử lý Bảng
            else if (tagName === 'TABLE') {
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => 
                    new TableRow({ children: Array.from(tr.querySelectorAll('td, th')).map(td => {
                        const colSpanAttr = td.getAttribute('colspan');
                        const rowSpanAttr = td.getAttribute('rowspan');

                        return new TableCell({ 
                            children: parseContent(td.innerHTML),
                            columnSpan: colSpanAttr ? parseInt(colSpanAttr) : undefined,
                            rowSpan: rowSpanAttr ? parseInt(rowSpanAttr) : undefined,
                            width: { size: 100, type: WidthType.PERCENTAGE }, 
                            borders: {top:{style:BorderStyle.SINGLE, size:1}, bottom:{style:BorderStyle.SINGLE, size:1}, left:{style:BorderStyle.SINGLE, size:1}, right:{style:BorderStyle.SINGLE, size:1}} 
                        }); 
                    })})
                );
                docChildren.push(new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                docChildren.push(new Paragraph(""));
            }
            // Xử lý Đoạn văn
            else if (el.innerText.trim()) {
                docChildren.push(...parseContent(innerHTML));
            }
        });

        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Nested_${Date.now()}.docx`);

    } catch(e) {
        alert("Lỗi xuất file: " + e.message);
        console.error(e);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
