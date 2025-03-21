import express from "express";
import 'dotenv/config';
import cors from "cors";
import TelegramBot from 'node-telegram-bot-api';
import fs from "fs";
import path from "path"; // Thêm module path
import moment from "moment"; // Thêm thư viện moment để xử lý thời gian
import { fileURLToPath } from 'url'; // Thêm để chuyển đổi URL sang đường dẫn file
import { dirname } from 'path'; // Thêm để lấy tên thư mục cha
import axios from "axios";

const __filename = fileURLToPath(import.meta.url); // Lấy đường dẫn tệp hiện tại
const __dirname = dirname(__filename); // Lấy thư mục chứa tệp hiện tại
const logFilePath = path.join(__dirname, 'expenses.txt'); // Đường dẫn đến file log

const app = express();
app.use(cors('*'));
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.setMyCommands([
    { command: 'start', description: '🤖 Bắt đầu ghi lại các khoản chi tiêu.' },
    { command: 'out', description: '🤖 Khoản tiền chi tiêu.' },
    { command: 'in', description: '🤖 Khoản tiền thu về.' },
    { command: 'now', description: '🤖 Dữ liệu chi tiêu trong ngày cho tới hiện tại.' },
    { command: 'day', description: '🤖 Dữ liệu chi tiêu của một ngày cụ thể.' },
    { command: 'month', description: '🤖 Thống kê chi tiết chi tiêu của tháng cụ thể.' },
    { command: 'clear', description: '🤖 Xóa toàn bộ giao dịch của 1 ngày cụ thể.' },
    { command: 'clearlogs', description: '🤖 Xóa toàn bộ giao dịch từng được ghi lại.' },
    { command: 'export', description: '🤖 Lấy bản ghi toàn bộ giao dịch.' },
]);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userFirstName = msg.from.first_name;
    bot.sendMessage(chatId, `${userFirstName}, Chào mừng bạn đến với bot Money Connection, giúp bạn ghi lại và theo dõi thu chi cá nhân!`);
});

const dateRecord = moment().format('DD/MM/YYYY HH:mm');

// CREATE LOG RECORD
const logToFile = (amount, description, status) => {
    // Get time now
    const logEntry = `\r\n${dateRecord} | ${amount} | ${description} | ${status}`;
    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) throw err;
        console.log('Create logs success!');
    });
};

// REMOVE REOCORD OLD
const cleanOldLogs = () => {
    fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) throw err;

        const lines = data.split(/[\r\n]+/);
        const currentDate = moment();

        const newLines = lines.filter(line => {
            if (line.trim() === '') return false;
            const datePart = line.split(' - ')[0];
            const logDate = moment(datePart, 'DD/MM HH:mm');
            return logDate.isAfter(currentDate.subtract(6, 'months'));
        });

        fs.writeFile(logFilePath, newLines.join('\n'), (err) => {
            if (err) throw err;
            console.log('Clear logs out date success!');
        });
    });
};

// MONEY IN
bot.onText(/\/in (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const commandContent = match[1];

    let [amount, description] = commandContent.split(/[\|,]/).map(str => str.trim());

    if (amount.includes('m')) {
        amount = parseFloat(amount.replace('m', '')) * 1000000;
    }
    else if (amount.includes('k')) {
        amount = parseFloat(amount.replace('k', '')) * 1000;
    } else {
        amount = parseFloat(amount) ;
    }
    amount = `${amount.toLocaleString('vi-VN')} đ`;

    if (amount && description) {
        try {
            logToFile(amount, description, 'in');
            bot.sendMessage(chatId, 
                `<i>Đã ghi nhận giao dịch mới:</i>\n----------------------\nTrị giá: <code>${amount}</code>\nNội dung: <code>${description}</code>\n----------------------\nLoại giao dịch: <code>Thu về</code>\n`, 
                { parse_mode: 'HTML' }
            );
            console.log(process.env.URL_WEBHOOK_MONEY_IN);
            
            if (process.env.URL_WEBHOOK_MONEY_IN) {
                const url = new URL(process.env.URL_WEBHOOK_MONEY_IN);
                
                url.searchParams.append('Giá trị', amount ? amount : '');
                url.searchParams.append('Nội dung', description ? description : '');
                url.searchParams.append('Ngày', dateRecord);
                
                axios.get(url)
                    .then(response => {
                        bot.sendMessage(chatId, '✅ Thêm dữ liệu vào Sheet thành công.');
                    })
                    .catch(err => {
                        bot.sendMessage(chatId, '❌ Thêm vào Google Sheet không thành công.');
                    });
            }
            cleanOldLogs();
        } catch (error) {
            bot.sendMessage(chatId, 'Có lỗi xảy ra khi ghi vào file. Vui lòng thử lại.');
            console.error('Lỗi khi ghi vào file:', error);
        }
    } else {
        bot.sendMessage(chatId, 'Xin lỗi, cú pháp không hợp lệ. Vui lòng nhập theo dạng "/in số tiền | nội dung".');
    }
});

// MONEY OUT
bot.onText(/\/out (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const commandContent = match[1];

    let [amount, description] = commandContent.split(/[\|,]/).map(str => str.trim());

    if (amount.includes('m')) {
        amount = parseFloat(amount.replace('m', '')) * 1000000;
    }
    else if (amount.includes('k')) {
        amount = parseFloat(amount.replace('k', '')) * 1000;
    } else {
        amount = parseFloat(amount) ;
    }
    amount = `${amount.toLocaleString('vi-VN')} đ`;

    if (amount && description) {
        try {
            logToFile(amount, description, 'out');
            bot.sendMessage(chatId, 
                `<i>Đã ghi nhận giao dịch mới:</i>\n----------------------\nTrị giá: <code>${amount}</code>\nNội dung: <code>${description}</code>\n----------------------\nLoại giao dịch: <code>Chi ra</code>\n`, 
                { parse_mode: 'HTML' }
            );
            cleanOldLogs();
            console.log(process.env.URL_WEBHOOK_MONEY_OUT);
            
            if (process.env.URL_WEBHOOK_MONEY_OUT) {
                const url = new URL(process.env.URL_WEBHOOK_MONEY_OUT);
    
                url.searchParams.append('Giá trị', amount ? amount : '');
                url.searchParams.append('Nội dung', description ? description : '');
                url.searchParams.append('Ngày', dateRecord);
    
                axios.get(url)
                    .then(response => {
                        bot.sendMessage(chatId, '✅ Thêm dữ liệu vào Sheet thành công.');
                    })
                    .catch(err => {
                        bot.sendMessage(chatId, '❌ Thêm vào Google Sheet không thành công.');
                    });
            }
        } catch (error) {
            bot.sendMessage(chatId, 'Có lỗi xảy ra khi ghi vào file. Vui lòng thử lại.');
            console.error('Lỗi khi ghi vào file:', error);
        }
    } else {
        bot.sendMessage(chatId, 'Xin lỗi, cú pháp không hợp lệ. Vui lòng nhập theo dạng "/out số tiền | nội dung".');
    }
});

// GET MONEY TO NOW
bot.onText(/\/now/, (msg) => {
    const chatId = msg.chat.id;
    const startOfDay = moment().startOf('day');

    fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) throw err;
        let totalIncome = 0;
        let totalExpense = 0;

        const lines = data.split(/[\r\n]+/);
        console.log(lines);

        lines.forEach(line => {
            if (line.trim() === '') return;

            const parts = line.split(' | ');
            if (parts.length < 4) return;

            const [datePart, amount, description, status] = parts;
            const logDate = moment(datePart, 'DD/MM HH:mm');

            if (logDate.isAfter(startOfDay) && logDate.isBefore(moment())) {
                let amountValue = parseFloat(amount.replace(/\./g, '').replace(/ đ/g, ''));

                if (status.trim() === 'in') {
                    totalIncome += amountValue;
                } else if (status.trim() === 'out') {
                    totalExpense += amountValue;
                }
            }
        });

        bot.sendMessage(chatId, 
            `<i>Thống kê chi tiêu:</i>\n----------------------\nTổng thu nhập: <code>${totalIncome.toLocaleString('vi-VN')}đ</code>\nTổng chi tiêu: <code>${totalExpense.toLocaleString('vi-VN')}đ</code>`, 
            { parse_mode: 'HTML' }
        );
    });
});

// GET RECORD DAY
bot.onText(/\/day (\d{1,2})\/(\d{1,2})/, (msg, match) => {
    const chatId = msg.chat.id;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = moment().year();
    const selectedDate = moment(`${year}-${month}-${day}`, 'YYYY-MM-DD');

    const threeMonthsAgo = moment().subtract(3, 'months');
    if (selectedDate.isBefore(threeMonthsAgo)) {
        bot.sendMessage(chatId, 'Không thể lấy dữ liệu cho ngày quá 3 tháng trước.');
        return;
    }

    fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) throw err;
        let totalIncome = 0;
        let totalExpense = 0;
        let transactionList = [];

        const lines = data.split(/[\r\n]+/);

        lines.forEach(line => {
            if (line.trim() === '') return;

            const parts = line.split(' | ');
            if (parts.length < 4) return;

            const [datePart, amount, description, status] = parts;
            const logDate = moment(datePart, 'DD/MM HH:mm');

            if (logDate.isSame(selectedDate, 'day')) {
                let amountValue = parseFloat(amount.replace(/\./g, '').replace(/ đ/g, ''));

                transactionList.push(`${logDate.format('HH:mm')} | ${amount} | ${description} | ${status}`);

                if (status.trim() === 'in') {
                    totalIncome += amountValue;
                } else if (status.trim() === 'out') {
                    totalExpense += amountValue;
                }
            }
        });

        const transactionSummary = transactionList.length > 0 ? transactionList.join('\n') : 'Không có giao dịch nào.';

        bot.sendMessage(chatId, 
            `<i>Thống kê cho ngày ${day}/${month}:</i>\n----------------------\n${transactionSummary}\n----------------------\nTổng thu nhập: <code>${totalIncome.toLocaleString('vi-VN')}đ</code>\nTổng chi tiêu: <code>${totalExpense.toLocaleString('vi-VN')}đ</code>\n`, 
            { parse_mode: 'HTML' }
        );
    });
});

// CLEAR RECORD IN DAY
bot.onText(/\/clear (\d{1,2})\/(\d{1,2})/, (msg, match) => {
    const chatId = msg.chat.id;
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');

    const specifiedDate = moment(`${day}/${month}`, 'DD/MM');

    const startOfSpecifiedDate = specifiedDate.clone().startOf('day');
    const endOfSpecifiedDate = specifiedDate.clone().endOf('day');

    fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) throw err;

        const lines = data.split(/\r\n/);
        const newLogEntries = [];

        lines.forEach(line => {
            if (line.trim() === '') return;

            const parts = line.split(' | ');
            if (parts.length < 4) return;

            const [datePart] = parts;
            const logDate = moment(datePart, 'DD/MM HH:mm');

            if (logDate.isBefore(startOfSpecifiedDate) || logDate.isAfter(endOfSpecifiedDate)) {
                newLogEntries.push(line);
            }
        });

        fs.writeFile(logFilePath, newLogEntries.join('\r\n') + '\r\n', (err) => {
            if (err) throw err;
            bot.sendMessage(chatId, `Đã xóa toàn bộ lịch sử giao dịch trong ngày <code>${day}/${month}.</code>`,{ parse_mode: 'HTML' });
        });
    });
});

// EXPORT FILE
bot.onText(/\/export/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendDocument(chatId, logFilePath)
        .then(() => {
            console.log('Send file to user success');
        })
        .catch(err => {
            bot.sendMessage(chatId, 'Có lỗi xảy ra khi gửi file log. Xin thử lại sau.');
        });
});

// LOGS MONTH
bot.onText(/\/month (\d{2})/, (msg, match) => {
    const chatId = msg.chat.id;
    const month = parseInt(match[1], 10);

    fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Có lỗi khi đọc file log:', err);
            bot.sendMessage(chatId, 'Có lỗi xảy ra khi đọc file log.');
            return;
        }

        let totalIncome = 0;
        let totalExpense = 0;
        let dailySummary = {};
        
        const lines = data.split(/[\r\n]+/);

        lines.forEach(line => {
            if (line.trim() === '') return;

            const parts = line.split(' | ');
            if (parts.length < 4) return;

            const [datePart, amount, description, status] = parts;
            const logDate = moment(datePart, 'DD/MM HH:mm');

            if (logDate.month() + 1 === month && logDate.isAfter(moment().subtract(6, 'months'))) {
                let amountValue = parseFloat(amount.replace(/\./g, '').replace(/ đ/g, ''));

                const day = logDate.format('DD/MM/YYYY');
                if (!dailySummary[day]) {
                    dailySummary[day] = { income: 0, expense: 0 };
                }

                if (status.trim() === 'in') {
                    totalIncome += amountValue;
                    dailySummary[day].income += amountValue;
                } else if (status.trim() === 'out') {
                    totalExpense += amountValue;
                    dailySummary[day].expense += amountValue;
                }
            }
        });

        let message = `<i>Thống kê thu chi tháng ${month}:</i>\n----------------------\n`;
        Object.keys(dailySummary).forEach(day => {
            const { income, expense } = dailySummary[day];
            message += `<b>${day}</b>:\nThu: <code>${income.toLocaleString('vi-VN')} đ</code>\nChi: <code>${expense.toLocaleString('vi-VN')} đ</code>\n`;
        });

        message += `\n----------------------\nTổng thu nhập: <code>${totalIncome.toLocaleString('vi-VN')} đ</code>\nTổng chi tiêu: <code>${totalExpense.toLocaleString('vi-VN')} đ</code>`;

        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    });
});

// STOP BOT AND CLEAR ALL LOGS
bot.onText(/\/clearlogs/, (msg) => {
    const chatId = msg.chat.id;

    fs.truncate(logFilePath, 0, (err) => {
        if (err) {
            bot.sendMessage(chatId, 'Không thể xóa file logs.');
            throw err;
        }
        bot.sendMessage(chatId, 'Toàn bộ lịch sử giao dịch đã được xóa thành công.');
    });
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (!msg.text.startsWith('/')) {
        bot.sendMessage(chatId, 'Câu lệnh không phù hợp, vui lòng bắt đầu bởi ký tự "/".');
    }
});

app.listen(process.env.PORT, () => {
    console.log(`Server listening port ${process.env.PORT}`);
});
