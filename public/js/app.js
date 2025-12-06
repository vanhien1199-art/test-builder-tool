// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo dòng chủ đề đầu tiên
    addTopicRow();

    // 2. Gán sự kiện cho các nút
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const examTypeSelect = document.getElementById('exam_type');

    if (btnAdd) btnAdd.addEventListener('click', addTopicRow);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);

    // 3. Xử lý Logic ẩn hiện ô nhập số tiết (Học kì) cho TỪNG CHỦ ĐỀ
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            
            // Tìm tất cả các khối nhập tiết trong các dòng chủ đề hiện có
            const allPeriodInputs = document.querySelectorAll('.hk-period-inputs');
            
            allPeriodInputs.forEach(div => {
                if (isHK) div.classList.remove('hidden');
                else div.classList.add('hidden');
            });
        });
        // Kích hoạt ngay lần đầu để đồng bộ trạng thái
        examTypeSelect.dispatchEvent(new Event('change'));
    }
    
    // 4. Gán sự kiện xóa dòng (Event Delegation)
    document.getElementById('topics-container').addEventListener('click', function(e) {
        // Tìm nút xóa hoặc icon bên trong nút xóa
        const btn = e.target.closest('.remove-topic-btn') || e.target.closest('.remove-btn'); 
        if (btn) {
            btn.closest('.topic-item').remove();
        }
    });
});

// --- HÀM THÊM CHỦ ĐỀ MỚI ---
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (container && template) {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);

        // Kiểm tra loại kiểm tra hiện tại để ẩn/hiện ô nhập tiết cho dòng MỚI thêm
        const examType = document.getElementById('exam_type');
        if (examType && examType.value === 'hk') {
            const newRow = container.lastElementChild;
            const hkInputs = newRow.querySelector('.hk-period-inputs');
            if (hkInputs) hkInputs.classList.remove('hidden');
        }
    }
}

// --- HÀM TẠO DỮ LIỆU (LOGIC MỚI: TỰ TÍNH TỔNG TIẾT) ---
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
        if (!licenseKey) {
            throw new Error("Vui lòng nhập Mã Kích Hoạt để tiếp tục!");
        }

        // 2. Thu thập và Tính toán dữ liệu từ các dòng chủ đề
        let sumP1 = 0; // Tổng tiết nửa đầu
        let sumP2 = 0; // Tổng tiết nửa sau
        const topicsList = [];

        document.querySelectorAll('.topic-item').forEach(row => {
            const name = row.querySelector('.topic-name').value.trim();
            const content = row.querySelector('.topic-content').value.trim();
            
            // Lấy số tiết riêng của từng bài
            const p1Input = row.querySelector('.topic-period-1');
            const p2Input = row.querySelector('.topic-period-2');
            
            const p1 = p1Input ? (parseInt(p1Input.value) || 0) : 0;
            const p2 = p2Input ? (parseInt(p2Input.value) || 0) : 0;

            if(name) {
                // Cộng dồn vào tổng
                sumP1 += p1;
                sumP2 += p2;

                topicsList.push({
                    name: name, 
                    content: content, 
                    p1: p1, // Gửi chi tiết lên server
                    p2: p2
                });
            }
        });

        if (topicsList.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề!");

        // 3. Đóng gói dữ liệu gửi đi
        const requestData = {
            license_key: licenseKey, 
            subject: get('subject'), 
            grade: get('grade'),
            semester: get('semester'), 
            exam_type: get('exam_type'), 
            time: get('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            // Gửi tổng số tiết đã tự động tính toán
            totalPeriodsHalf1: sumP1, 
            totalPeriodsHalf2: sumP2,
            topics: topicsList
        };

        // 4. Gọi API
        const res = await fetch('/api_matrix', {
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(requestData)
        });
        
        if(!res.ok) {
            let errMsg = await res.text();
            try { errMsg = JSON.parse(errMsg).error } catch(e){}
            throw new Error(`Lỗi Server: ${errMsg}`);
        }

        // 5. Đọc Stream phản hồi
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
        
        // 6. Hiển thị kết quả
        // Loại bỏ markdown block (```html ... ```)
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
// --- LOGIC XUẤT FILE DOCX (NATIVE EQUATION 100%) ---
// ============================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    
    // Kiểm tra thư viện
    if (typeof docx === 'undefined') {
        alert("Lỗi: Thư viện DOCX chưa tải xong hoặc bị chặn mạng. Vui lòng tải lại trang (F5)."); return;
    }

    const btn = document.getElementById('btnDownloadWord');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tạo file...`; 
    btn.disabled = true;

    try {
        // Lấy các thành phần từ thư viện DOCX Global
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, BorderStyle, HeadingLevel, AlignmentType } = window.docx;
        
        // Hàm xác định Heading Level từ thẻ H1-H6
        const getHeadingLevel = (tag) => {
            const map = { 'H1': HeadingLevel.HEADING_1, 'H2': HeadingLevel.HEADING_2, 'H3': HeadingLevel.HEADING_3, 'H4': HeadingLevel.HEADING_4, 'H5': HeadingLevel.HEADING_5, 'H6': HeadingLevel.HEADING_6 };
            return map[tag] || HeadingLevel.NORMAL;
        };

        // 1. Hàm đệ quy: XML Node (từ Temml) -> Docx Math Object
        function convertXmlNode(node) {
            if (!node) return [];
            const results = [];
            node.childNodes.forEach(child => {
                if (child.nodeType === 3) { // Text Node
                    if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue)); 
                    return; 
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

        // 2. Parse nội dung (Text + LaTeX)
        function parseContent(htmlText) {
            // Tách nội dung theo dấu $$ (LaTeX)
            const parts = htmlText.split(/\$\$(.*?)\$\$/g);
            const runs = [];
            parts.forEach((part, index) => {
                if (index % 2 === 1) { // Đây là LaTeX -> Chuyển thành Equation
                    try {
                        if (typeof temml !== 'undefined') {
                            // Bước A: LaTeX -> XML
                            const xmlString = temml.renderToString(part, { xml: true });
                            // Bước B: XML String -> DOM
                            const parser = new DOMParser();
                            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
                            const mathRoot = xmlDoc.getElementsByTagName("math")[0];
                            // Bước C: DOM -> Docx Object
                            const mathChildren = convertXmlNode(mathRoot);
                            runs.push(new MathObj({ children: mathChildren }));
                        } else {
                            // Fallback nếu thiếu thư viện: Hiện text màu xanh
                            runs.push(new TextRun({ text: part, bold: true, color: "2E75B6" }));
                        }
                    } catch (e) { 
                        // Lỗi công thức: Hiện text màu đỏ
                        runs.push(new TextRun({ text: `(Lỗi CT: ${part})`, color: "FF0000" })); 
                    }
                } else { // Text thường
                    const cleanText = part.replace(/<[^>]*>?/gm, " ").replace(/&nbsp;/g, " ");
                    if (cleanText.trim()) runs.push(new TextRun(cleanText));
                }
            });
            return [new Paragraph({ children: runs })];
        }

        // 3. Xây dựng Document từ HTML AI trả về
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
                    spacing: { before: 200, after: 100 }
                }));
            } 
            // Xử lý Bảng
            else if (tagName === 'TABLE') {
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => 
                    new TableRow({ children: Array.from(tr.querySelectorAll('td, th')).map(td => {
                        // Xử lý colspan, rowspan
                        const colSpanAttr = td.getAttribute('colspan');
                        const rowSpanAttr = td.getAttribute('rowspan');

                        return new TableCell({ 
                            children: parseContent(td.innerHTML),
                            columnSpan: colSpanAttr ? parseInt(colSpanAttr) : undefined,
                            rowSpan: rowSpanAttr ? parseInt(rowSpanAttr) : undefined,
                            width: { size: 100, type: WidthType.PERCENTAGE }, 
                            borders: {
                                top:{style:BorderStyle.SINGLE, size:1}, 
                                bottom:{style:BorderStyle.SINGLE, size:1}, 
                                left:{style:BorderStyle.SINGLE, size:1}, 
                                right:{style:BorderStyle.SINGLE, size:1}
                            } 
                        }); 
                    })})
                );
                docChildren.push(new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                docChildren.push(new Paragraph("")); // Xuống dòng sau bảng
            }
            // Xử lý Đoạn văn (P, DIV, LI...)
            else if (el.innerText.trim()) {
                docChildren.push(...parseContent(innerHTML));
            }
        });

        // Tạo file và lưu
        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Native_${Date.now()}.docx`);

    } catch(e) {
        alert("Lỗi xuất file: " + e.message);
        console.error(e);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
