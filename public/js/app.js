// File: public/js/app.js

// ... (các hàm handleGenerate, addTopicRow, cleanMathFormulas giữ nguyên) ...

// XỬ LÝ TẢI FILE WORD (ĐÃ FIX LỖI BORDER VÀ FONT)
function handleDownloadWord() {
    if (!window.generatedHTML) { 
        alert("Chưa có nội dung để tải!"); 
        return; 
    }

    // CSS INLINE CHO FILE WORD (Bắt buộc để Word hiện đúng Border và Font)
    const css = `
        <style>
            /* 1. Thiết lập Font và Căn lề chuẩn Công văn */
            body { 
                font-family: 'Times New Roman', serif; 
                font-size: 14pt; /* Cỡ chữ 14pt là chuẩn cho văn bản Word */
                line-height: 1.3;
                margin: 2cm; /* Căn lề 2cm (trên, dưới, trái, phải) */
            }
            
            /* 2. Thiết lập bảng (Rất quan trọng) */
            table { 
                width: 100%; 
                border-collapse: collapse; /* Gộp các đường viền thành 1 */
                margin-bottom: 15pt; 
            }
            
            /* 3. Đảm bảo mọi TH, TD đều có viền đen */
            th, td { 
                border: 1pt solid black; /* Độ dày viền 1pt */
                padding: 6pt 8pt; 
                vertical-align: top; 
                font-size: 13pt; /* Cỡ chữ trong bảng nhỏ hơn 1 chút (13pt) */
            }

            /* 4. Định dạng tiêu đề */
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
            // Chuyển đổi sang Blob và định dạng khổ giấy
            const converted = htmlDocx.asBlob(htmlContent, { 
                orientation: 'landscape', // Khổ ngang cho Ma trận rộng
                margins: { top: 720, right: 720, bottom: 720, left: 720 } // 1 inch = 720 twips (Khoảng 1.27cm)
            }); 
            saveAs(converted, `Ma_Tran_De_7991_${new Date().getTime()}.docx`);
        } else {
            alert("Lỗi: Thư viện tạo file Word chưa tải xong. Vui lòng kiểm tra kết nối mạng.");
        }
    } catch (e) {
        alert("Lỗi tạo file Word: " + e.message);
    }
}
