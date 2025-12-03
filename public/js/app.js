// File: public/js/app.js (Phần Xử lý Tải Word)

function handleDownloadWord() {
    if (!window.generatedHTML) { 
        alert("Chưa có nội dung để tải!"); 
        return; 
    }

    // CSS INLINE TỐI ƯU CHO WORD (Sử dụng !important và áp dụng trực tiếp lên TABLE)
    const css = `
        <style>
            /* 1. Thiết lập Font và Căn lề chuẩn */
            body { 
                font-family: 'Times New Roman', serif; 
                font-size: 13pt; 
                line-height: 1.5;
            }
            
            /* 2. ÉP BORDER BẰNG CÚ PHÁP MẠNH NHẤT */
            table { 
                width: 100%; 
                border-collapse: collapse !important;
                border: 1pt solid black !important; /* Áp dụng border lên TABLE */
            }
            
            /* Áp dụng Border lên từng ô TH và TD */
            th, td { 
                border: 1pt solid black !important; 
                border-collapse: collapse !important;
                padding: 8pt; 
                vertical-align: top; 
                font-size: 12pt; /* Cỡ chữ trong bảng */
                background-color: white !important; /* Đảm bảo không có nền xám */
            }

            /* Định dạng tiêu đề */
            h1, h2, h3, h4 { 
                text-align: center; 
                font-weight: bold; 
                margin-top: 15pt;
                margin-bottom: 8pt;
            }
        </style>
    `;

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            ${css}
        </head>
        <body>
            ${window.generatedHTML}
        </body>
        </html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent, { 
                orientation: 'landscape',
                // Căn lề 2cm (khoảng 1134 twips)
                margins: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, 
                size: 'A4'
            }); 
            saveAs(converted, `Ma_Tran_De_7991_${new Date().getTime()}.docx`);
        } else {
            alert("Lỗi: Thư viện tạo file Word chưa tải xong.");
        }
    } catch (e) {
        alert("Lỗi tạo file Word: " + e.message);
        console.error(e);
    }
}
