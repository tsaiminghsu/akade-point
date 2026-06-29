"use client";

import React, { useState, useRef, useEffect } from 'react';

import { Download, RefreshCw } from 'lucide-react';

import { ScratchFilmApplicatorGuide } from './ScratchFilmApplicatorGuide';



const ScratchCardGenerator = () => {

    const [scratches, setScratches] = useState(20);

    const [numbers, setNumbers] = useState([]);

    const [layout, setLayout] = useState('abcd'); // 'abcd', 'lr', 'full', 'abcdefgh', 'nine', 'challenge'

    const [fullPageLimit, setFullPageLimit] = useState(120); // 120 or 160

    const canvasRef = useRef(null);



    // 生成不重複的隨機號碼

    const generateUniqueNumbers = (count, max) => {

        const numbers = [];

        const available = Array.from({ length: max }, (_, i) => i + 1);


        for (let i = 0; i < count; i++) {

            const randomIndex = Math.floor(Math.random() * available.length);

            numbers.push(available[randomIndex]);

            available.splice(randomIndex, 1);

        }


        return numbers;

    };



    // 生成對應範圍的隨機號碼

    const generateRandomNumbers = (scratchCount, layoutType) => {

        const nums = [];


        if (layoutType === 'abcd') {

            // 4張卡片，每張不重複

            for (let i = 0; i < 4; i++) {

                nums.push(...generateUniqueNumbers(scratchCount, scratchCount));

            }

        } else if (layoutType === 'lr') {

            // 2張卡片，每張不重複

            for (let i = 0; i < 2; i++) {

                nums.push(...generateUniqueNumbers(scratchCount, scratchCount));

            }

        } else if (layoutType === 'abcdefgh') {

            // 8張卡片，每張不重複

            for (let i = 0; i < 8; i++) {

                nums.push(...generateUniqueNumbers(scratchCount, scratchCount));

            }

        } else if (layoutType === 'challenge') {

            // 闖關積分賽：8張卡片，每張不重複

            for (let i = 0; i < 8; i++) {

                nums.push(...generateUniqueNumbers(scratchCount, scratchCount));

            }

        } else if (layoutType === 'nine') {

            // 9張卡片，每張9格（空白）

            for (let i = 0; i < 9; i++) {

                nums.push(...generateUniqueNumbers(9, 9));

            }

        } else if (layoutType === 'full') {

            // A4滿版，不重複

            nums.push(...generateUniqueNumbers(scratchCount, scratchCount));

        }


        return nums;

    };



    // 初始化

    useEffect(() => {

        setNumbers(generateRandomNumbers(scratches, layout));

    }, []);



    const handleScratchesChange = (newScratches) => {

        setScratches(newScratches);

        setNumbers(generateRandomNumbers(newScratches, layout));

    };



    const handleLayoutChange = (newLayout) => {

        let newScratches = scratches;

        if (newLayout === 'full') {

            newScratches = 80;

        } else if (newLayout === 'lr') {

            newScratches = 40;

        } else if (newLayout === 'abcdefgh') {

            newScratches = 10;

        } else if (newLayout === 'challenge') {

            newScratches = 10;

        } else if (newLayout === 'nine') {

            newScratches = 9; // 九宮格固定9格

        } else {

            newScratches = 20;

        }


        setLayout(newLayout);

        setScratches(newScratches);

        setNumbers(generateRandomNumbers(newScratches, newLayout));

    };



    const handleRegenerate = () => {

        setNumbers(generateRandomNumbers(scratches, layout));

    };



    const generateAllPages = () => {

        const pages = [];


        if (layout === 'full') {

            const pagesCount = Math.ceil(scratches / fullPageLimit);

            for (let i = 0; i < pagesCount; i++) {

                const canvas = document.createElement('canvas');

                const ctx = canvas.getContext('2d');

                const remainingScratches = Math.min(fullPageLimit, scratches - (i * fullPageLimit));

                generateFullLayout(ctx, i, remainingScratches);

                pages.push(canvas);

            }

        } else {

            const canvas = document.createElement('canvas');

            const ctx = canvas.getContext('2d');


            if (layout === 'abcd') {

                generateABCDLayout(ctx);

            } else if (layout === 'lr') {

                generateLRLayout(ctx);

            } else if (layout === 'abcdefgh') {

                generateABCDEFGHLayout(ctx);

            } else if (layout === 'nine') {

                generateNineLayout(ctx);

            } else if (layout === 'challenge') {

                generateChallengeLayout(ctx);

            } else {

                generateFullLayout(ctx, 0, Math.min(fullPageLimit, scratches));

            }

            pages.push(canvas);

        }


        return pages;

    };



    const generateABCDLayout = (ctx) => {

        const dpi = 300;

        const width = 29.7 * dpi / 2.54;

        const height = 21 * dpi / 2.54;

        ctx.canvas.width = width;

        ctx.canvas.height = height;



        ctx.fillStyle = '#ffffff';

        ctx.fillRect(0, 0, width, height);



        const cardsPerRow = 2;

        const totalCards = 4;

        const cardWidth = width / cardsPerRow;

        const cardHeight = height / 2;


        // 根據刮數決定行列配置

        let cols, rows;

        if (scratches === 30) {

            rows = 5;

            cols = 6;

        } else {

            cols = 5;

            rows = Math.ceil(scratches / cols);

        }



        for (let cardIdx = 0; cardIdx < totalCards; cardIdx++) {

            const row = Math.floor(cardIdx / cardsPerRow);

            const col = cardIdx % cardsPerRow;

            const startX = col * cardWidth;

            const startY = row * cardHeight;



            ctx.strokeStyle = '#cccccc';

            ctx.lineWidth = 2;

            ctx.setLineDash([10, 5]);

            ctx.strokeRect(startX, startY, cardWidth, cardHeight);

            ctx.setLineDash([]);



            drawCardContent(ctx, startX, startY, cardWidth, cardHeight, cardIdx, rows, cols, String.fromCharCode(65 + cardIdx));

        }

    };



    const generateABCDEFGHLayout = (ctx) => {

        const dpi = 300;

        const width = 29.7 * dpi / 2.54;

        const height = 21 * dpi / 2.54;

        ctx.canvas.width = width;

        ctx.canvas.height = height;



        ctx.fillStyle = '#ffffff';

        ctx.fillRect(0, 0, width, height);



        const cardsPerRow = 4;

        const totalCards = 8;

        const cardWidth = width / cardsPerRow;

        const cardHeight = height / 2;

        const rows = 5;

        const cols = Math.ceil(scratches / rows);



        for (let cardIdx = 0; cardIdx < totalCards; cardIdx++) {

            const row = Math.floor(cardIdx / cardsPerRow);

            const col = cardIdx % cardsPerRow;

            const startX = col * cardWidth;

            const startY = row * cardHeight;



            ctx.strokeStyle = '#cccccc';

            ctx.lineWidth = 2;

            ctx.setLineDash([10, 5]);

            ctx.strokeRect(startX, startY, cardWidth, cardHeight);

            ctx.setLineDash([]);



            drawCardContent(ctx, startX, startY, cardWidth, cardHeight, cardIdx, rows, cols, String.fromCharCode(65 + cardIdx));

        }

    };



    const generateNineLayout = (ctx) => {

        const dpi = 300;

        const width = 29.7 * dpi / 2.54;

        const height = 21 * dpi / 2.54;

        ctx.canvas.width = width;

        ctx.canvas.height = height;



        ctx.fillStyle = '#ffffff';

        ctx.fillRect(0, 0, width, height);



        const cardsPerRow = 3;

        const totalCards = 9;

        const cardWidth = width / cardsPerRow;

        const cardHeight = height / 3;

        const rows = 3;

        const cols = Math.ceil(scratches / rows);



        for (let cardIdx = 0; cardIdx < totalCards; cardIdx++) {

            const row = Math.floor(cardIdx / cardsPerRow);

            const col = cardIdx % cardsPerRow;

            const startX = col * cardWidth;

            const startY = row * cardHeight;



            ctx.strokeStyle = '#cccccc';

            ctx.lineWidth = 2;

            ctx.setLineDash([10, 5]);

            ctx.strokeRect(startX, startY, cardWidth, cardHeight);

            ctx.setLineDash([]);



            drawCardContent(ctx, startX, startY, cardWidth, cardHeight, cardIdx, rows, cols, String.fromCharCode(65 + cardIdx));

        }

    };



    const generateChallengeLayout = (ctx) => {

        const dpi = 300;

        const width = 29.7 * dpi / 2.54;

        const height = 21 * dpi / 2.54;

        ctx.canvas.width = width;

        ctx.canvas.height = height;



        ctx.fillStyle = '#ffffff';

        ctx.fillRect(0, 0, width, height);



        const cardsPerRow = 4;

        const totalCards = 8;

        const cardWidth = width / cardsPerRow;

        const cardHeight = height / 2;

        const rows = 5;

        const cols = Math.ceil(scratches / rows);



        for (let cardIdx = 0; cardIdx < totalCards; cardIdx++) {

            const row = Math.floor(cardIdx / cardsPerRow);

            const col = cardIdx % cardsPerRow;

            const startX = col * cardWidth;

            const startY = row * cardHeight;



            ctx.strokeStyle = '#cccccc';

            ctx.lineWidth = 2;

            ctx.setLineDash([10, 5]);

            ctx.strokeRect(startX, startY, cardWidth, cardHeight);

            ctx.setLineDash([]);



            drawCardContent(ctx, startX, startY, cardWidth, cardHeight, cardIdx, rows, cols, String.fromCharCode(65 + cardIdx));

        }

    };



    const generateLRLayout = (ctx) => {

        const dpi = 300;

        const width = 29.7 * dpi / 2.54;

        const height = 21 * dpi / 2.54;

        ctx.canvas.width = width;

        ctx.canvas.height = height;



        ctx.fillStyle = '#ffffff';

        ctx.fillRect(0, 0, width, height);



        const totalCards = 2;

        const cardWidth = width / 2;

        const cardHeight = height;

        const cols = 5;

        const rows = Math.ceil(scratches / cols);



        for (let cardIdx = 0; cardIdx < totalCards; cardIdx++) {

            const startX = cardIdx * cardWidth;

            const startY = 0;



            if (cardIdx === 0) {

                ctx.strokeStyle = '#cccccc';

                ctx.lineWidth = 2;

                ctx.setLineDash([10, 5]);

                ctx.beginPath();

                ctx.moveTo(cardWidth, 0);

                ctx.lineTo(cardWidth, height);

                ctx.stroke();

                ctx.setLineDash([]);

            }



            const label = cardIdx === 0 ? '左' : '右';

            drawCardContent(ctx, startX, startY, cardWidth, cardHeight, cardIdx, rows, cols, label);

        }

    };



    const generateFullLayout = (ctx, pageIndex = 0, pageScratches = 120) => {

        const dpi = 300;

        const width = 29.7 * dpi / 2.54;

        const height = 21 * dpi / 2.54;

        ctx.canvas.width = width;

        ctx.canvas.height = height;



        ctx.fillStyle = '#ffffff';

        ctx.fillRect(0, 0, width, height);



        const rows = 10;

        const cols = Math.ceil(pageScratches / rows);


        const startOffset = pageIndex * fullPageLimit;

        const actualPageScratches = Math.min(fullPageLimit, scratches - startOffset);



        drawCardContent(ctx, 0, 0, width, height, pageIndex, rows, cols, '滿', startOffset, actualPageScratches);

    };



    const drawCardContent = (ctx, startX, startY, cardWidth, cardHeight, cardIdx, rows, cols, label, startOffset = 0, pageScratches = 0) => {

        // 右上角刮數標示（九宮格版改為「九宮格」，闖關積分賽不顯示）

        ctx.font = 'bold 80px Arial';

        ctx.fillStyle = '#000000';

        ctx.textAlign = 'right';

        ctx.textBaseline = 'top';

        if (layout === 'nine') {

            ctx.fillText('九宮格', startX + cardWidth - 40, startY + 30);

        } else if (layout === 'challenge') {

            // 闖關積分賽不顯示右上角文字

        } else {

            ctx.fillText(`${scratches}刮`, startX + cardWidth - 40, startY + 30);

        }



        // 左上方規則說明文字 - 放大字體

        ctx.font = 'bold 28px Arial';

        ctx.fillStyle = '#333333';

        ctx.textAlign = 'left';

        ctx.textBaseline = 'top';

        const ruleY = startY + 30;


        if (layout === 'nine') {

            // 九宮格版的規則

            ctx.fillText('1.任 條連線，贈送 ', startX + 30, ruleY);

            ctx.fillText('2.活動為加贈，主辦方保有最終解釋權利', startX + 30, ruleY + 40);

        } else if (layout === 'challenge') {

            // 闖關積分賽的規則

            ctx.font = 'bold 24px Arial';

            ctx.fillText('1.刮中號碼 代表闖關成功，否則用積分來累計', startX + 30, ruleY);

            ctx.fillText('2.積分累計隨著號碼被刮中停止累計', startX + 30, ruleY + 35);

            ctx.fillText('3.請勿偷刮、作弊，主辦方保有最終解釋權利', startX + 30, ruleY + 70);

        } else {

            // 其他版型的規則

            ctx.fillText('1.出 樣，贈送 刮，對中號碼中獎，作弊不算', startX + 30, ruleY);

            ctx.fillText('2.活動為加贈，主辦方保有最終解釋權利', startX + 30, ruleY + 40);

        }



        // 繪製數字網格 - 根據版型和刮數決定格子大小

        const dpi = 300;

        let cellSizeMM;


        // 決定格子大小

        if (layout === 'full') {

            cellSizeMM = 18; // A4滿版: 18mm

        } else if (layout === 'lr') {

            cellSizeMM = scratches <= 45 ? 20 : 16; // 左右版: 45刮以下20mm，否則16mm

        } else if (layout === 'abcd') {

            cellSizeMM = scratches <= 20 ? 18 : 16; // ABCD版: 20刮以下18mm，否則16mm

        } else {

            cellSizeMM = 16; // ABCDEFGH版: 16mm

        }


        const cellSize = cellSizeMM * dpi / 25.4; // 轉換為像素


        // 計算實際需要的格子數

        let startIdx, endIdx;

        if (layout === 'full') {

            startIdx = startOffset;

            endIdx = Math.min(startOffset + (pageScratches || fullPageLimit), scratches);

        } else if (layout === 'abcdefgh' || layout === 'nine' || layout === 'challenge') {

            startIdx = cardIdx * scratches;

            endIdx = (cardIdx + 1) * scratches;

        } else if (layout === 'abcd') {

            startIdx = cardIdx * scratches;

            endIdx = (cardIdx + 1) * scratches;

        } else {

            startIdx = cardIdx * scratches;

            endIdx = (cardIdx + 1) * scratches;

        }


        const totalCells = endIdx - startIdx;

        const actualCols = Math.min(cols, totalCells);

        const actualRows = Math.ceil(totalCells / actualCols);


        // 計算網格的實際尺寸

        const gridWidth = actualCols * cellSize;

        // 居中放置網格

        const gridStartX = startX + (cardWidth - gridWidth) / 2;

        const gridStartY = startY + 140;



        ctx.textAlign = 'center';

        ctx.textBaseline = 'middle';



        let arrayIdx = startIdx;

        let displayCount = 0;

        const maxDisplay = endIdx - startIdx;


        for (let i = 0; i < actualRows && displayCount < maxDisplay; i++) {

            for (let j = 0; j < actualCols && displayCount < maxDisplay; j++) {

                const x = gridStartX + j * cellSize;

                const y = gridStartY + i * cellSize;


                ctx.strokeStyle = '#000000';

                ctx.lineWidth = 2;

                ctx.strokeRect(x, y, cellSize, cellSize);


                // 九宮格版不顯示數字，其他版型顯示數字

                if (layout !== 'nine' && arrayIdx < numbers.length) {

                    const fontSize = cellSize * 0.4;

                    ctx.font = `${fontSize}px Arial`;

                    ctx.fillStyle = '#cccccc';

                    ctx.fillText(

                        numbers[arrayIdx].toString(),

                        x + cellSize / 2,

                        y + cellSize / 2

                    );

                    arrayIdx++;

                    displayCount++;

                } else if (layout === 'nine') {

                    arrayIdx++;

                    displayCount++;

                }

            }

        }



        // 右下角標籤

        const labelWidth = 110;

        const labelHeight = 55;

        ctx.fillStyle = '#000000';

        ctx.fillRect(startX + 30, startY + cardHeight - labelHeight - 30, labelWidth, labelHeight);

        ctx.fillStyle = '#ffffff';

        ctx.font = 'bold 30px Arial';

        ctx.textAlign = 'center';

        ctx.textBaseline = 'middle';


        // 九宮格版顯示「九宮格+標籤」，其他版型顯示「刮數+標籤」

        if (layout === 'nine') {

            ctx.fillText(`九宮格${label}`, startX + 85, startY + cardHeight - 57);

        } else {

            ctx.fillText(`${scratches}刮${label}`, startX + 85, startY + cardHeight - 57);

        }


        // 卡片正下方中間位置加上品牌文字

        ctx.fillStyle = '#000000';

        ctx.font = 'bold 80px Arial';

        ctx.textAlign = 'center';

        ctx.textBaseline = 'bottom';


        // 根據版型顯示不同文字

        if (layout === 'nine') {

            // 九宮格版顯示「冥想你的號碼來連線」，字體稍小

            ctx.font = 'bold 50px Arial';

            ctx.fillText('冥想你的號碼來連線', startX + cardWidth / 2, startY + cardHeight - 15);

        } else {

            // 其他版型顯示「冥想刮」

            // 調整位置避免與左下角標籤重疊

            const bottomY = startY + cardHeight - (layout === 'lr' && scratches >= 55 ? 25 : 20);

            ctx.fillText('冥想刮', startX + cardWidth / 2, bottomY);

        }

    };



    const handleDownload = async () => {

        const pages = generateAllPages();


        try {

            // 將所有頁面轉換為圖片

            const images = pages.map(canvas => canvas.toDataURL('image/png'));


            // 創建一個包含所有圖片的HTML內容

            let htmlContent = `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>刮刮卡_${scratches}刮</title>

<style>

@page {

size: A4 landscape;

margin: 0;

}

body {

margin: 0;

padding: 0;

}

.page {

width: 297mm;

height: 210mm;

page-break-after: always;

position: relative;

}

.page:last-child {

page-break-after: auto;

}

img {

width: 100%;

height: 100%;

display: block;

}

</style>

</head>

<body>

`;



            images.forEach((imgData, index) => {

                htmlContent += `

<div class="page">

<img src="${imgData}" alt="刮刮卡第${index + 1}頁" />

</div>

`;

            });



            htmlContent += `

</body>

</html>

`;



            // 創建 Blob 並下載為 HTML 文件

            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });

            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');


            const layoutName = layout === 'abcd' ? 'ABCD版' :

                layout === 'lr' ? '左右版' :

                    layout === 'abcdefgh' ? 'ABCDEFGH版' :

                        layout === 'nine' ? '九宮格版' :

                            layout === 'challenge' ? '闖關積分賽' :

                                'A4滿版';


            link.download = `刮刮卡_${scratches}刮_${layoutName}.html`;

            link.href = url;

            link.click();

            URL.revokeObjectURL(url);


            // 顯示提示訊息

            alert('HTML檔案已下載！\n\n使用方式：\n1. 開啟下載的HTML檔案\n2. 點選「檔案」→「列印」\n3. 選擇「另存為PDF」或直接列印\n4. 確認方向為「橫向」，紙張大小為「A4」');


        } catch (error) {

            console.error('下載錯誤:', error);

            alert('下載失敗，請重試');

        }

    };



    const generateCard = () => {

        const canvas = canvasRef.current;

        if (!canvas) return;


        const ctx = canvas.getContext('2d');


        if (layout === 'abcd') {

            generateABCDLayout(ctx);

        } else if (layout === 'lr') {

            generateLRLayout(ctx);

        } else if (layout === 'abcdefgh') {

            generateABCDEFGHLayout(ctx);

        } else if (layout === 'nine') {

            generateNineLayout(ctx);

        } else if (layout === 'challenge') {

            generateChallengeLayout(ctx);

        } else {

            // 只顯示第一頁預覽

            const actualPageScratches = Math.min(fullPageLimit, scratches);

            generateFullLayout(ctx, 0, actualPageScratches);

        }

    };



    useEffect(() => {

        if (numbers.length > 0) {

            // A4滿版多頁時不使用canvas預覽，而是直接在JSX中渲染

            if (layout === 'full' && scratches > fullPageLimit) {

                // 強制重新渲染

                const canvas = canvasRef.current;

                if (canvas) {

                    const ctx = canvas.getContext('2d');

                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                }

            } else {

                generateCard();

            }

        }

    }, [numbers, scratches, layout, fullPageLimit]);



    // 根據版型決定刮數選項

    const getScratchOptions = () => {

        if (layout === 'full') {

            const options = [];

            for (let i = 10; i <= 480; i += 5) {

                options.push(i);

            }

            return options;

        } else if (layout === 'lr') {

            return [40, 45, 50, 55, 60];

        } else if (layout === 'abcdefgh') {

            return [5, 10, 15, 20];

        } else if (layout === 'challenge') {

            return [5, 10, 15, 20];

        } else if (layout === 'nine') {

            return [9]; // 九宮格固定9格，不顯示選項

        } else {

            // ABCD版: 5-30刮

            const options = [];

            for (let i = 5; i <= 30; i += 5) {

                options.push(i);

            }

            return options;

        }

    };



    const getPagesCount = () => {

        if (layout === 'full') {

            return Math.ceil(scratches / fullPageLimit);

        }

        return 1;

    };



    return (

        <div className="min-h-screen bg-gradient-to-br from-yellow-100 via-pink-100 to-red-100 p-8">

            <div className="max-w-7xl mx-auto">

                <h1 className="text-4xl font-bold text-center mb-8 text-red-600">

                    娃娃機刮刮卡產生器

                </h1>



                <div className="bg-white rounded-lg shadow-xl p-8 mb-8">

                    <div className="flex flex-col items-center gap-6">

                        <div className="flex flex-wrap items-center justify-center gap-4">

                            <label className="text-xl font-semibold text-gray-700">

                                版型選擇：

                            </label>

                            <div className="flex flex-wrap gap-3">

                                <button

                                    onClick={() => handleLayoutChange('abcd')}

                                    className={`px-5 py-3 rounded-lg font-bold text-base transition ${layout === 'abcd'

                                        ? 'bg-red-500 text-white'

                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'

                                        }`}

                                >

                                    ABCD版 (4張)

                                </button>

                                <button

                                    onClick={() => handleLayoutChange('abcdefgh')}

                                    className={`px-5 py-3 rounded-lg font-bold text-base transition ${layout === 'abcdefgh'

                                        ? 'bg-red-500 text-white'

                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'

                                        }`}

                                >

                                    ABCDEFGH版 (8張)

                                </button>

                                <button

                                    onClick={() => handleLayoutChange('nine')}

                                    className={`px-5 py-3 rounded-lg font-bold text-base transition ${layout === 'nine'

                                        ? 'bg-red-500 text-white'

                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'

                                        }`}

                                >

                                    九宮格版 (9張)

                                </button>

                                <button

                                    onClick={() => handleLayoutChange('challenge')}

                                    className={`px-5 py-3 rounded-lg font-bold text-base transition ${layout === 'challenge'

                                        ? 'bg-red-500 text-white'

                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'

                                        }`}

                                >

                                    闖關積分賽 (8張)

                                </button>

                                <button

                                    onClick={() => handleLayoutChange('lr')}

                                    className={`px-5 py-3 rounded-lg font-bold text-base transition ${layout === 'lr'

                                        ? 'bg-red-500 text-white'

                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'

                                        }`}

                                >

                                    左右版 (2張)

                                </button>

                                <button

                                    onClick={() => handleLayoutChange('full')}

                                    className={`px-5 py-3 rounded-lg font-bold text-base transition ${layout === 'full'

                                        ? 'bg-red-500 text-white'

                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'

                                        }`}

                                >

                                    A4滿版

                                </button>

                            </div>

                        </div>



                        {layout === 'full' && (

                            <div className="flex items-center gap-6">

                                <label className="text-xl font-semibold text-gray-700">

                                    單頁限制：

                                </label>

                                <div className="flex flex-wrap gap-3">

                                    {[70, 80, 90, 100, 120, 160].map(limit => (

                                        <button

                                            key={limit}

                                            onClick={() => setFullPageLimit(limit)}

                                            className={`px-6 py-2 rounded-lg font-bold transition ${fullPageLimit === limit

                                                ? 'bg-blue-500 text-white'

                                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'

                                                }`}

                                        >

                                            {limit}刮/頁

                                        </button>

                                    ))}

                                </div>

                            </div>

                        )}



                        <div className="flex items-center gap-6">

                            <label className="text-xl font-semibold text-gray-700">

                                刮數設定：

                            </label>

                            {layout === 'nine' ? (

                                <div className="text-2xl font-bold text-gray-600 px-4 py-2">

                                    固定 9 格

                                </div>

                            ) : (

                                <select

                                    value={scratches}

                                    onChange={(e) => handleScratchesChange(parseInt(e.target.value))}

                                    className="text-2xl font-bold border-2 border-red-300 rounded-lg p-2 px-4"

                                >

                                    {getScratchOptions().map(num => (

                                        <option key={num} value={num}>{num}刮</option>

                                    ))}

                                </select>

                            )}

                        </div>



                        <div className="text-center text-gray-600">

                            {layout !== 'nine' && (

                                <p className="text-lg">

                                    號碼範圍: 1 ~ {scratches}

                                </p>

                            )}

                            <p className="text-sm mt-2">

                                {layout === 'abcd'

                                    ? `版型配置: ${scratches === 30 ? '5行 × 6列' : 'N行 × 5列'} (5-30刮) | 格子大小: ${scratches <= 20 ? '18mm' : '16mm'}`

                                    : layout === 'abcdefgh'

                                        ? `版型配置: 5行 × N列 (5-20刮) | 格子大小: 16mm`

                                        : layout === 'challenge'

                                            ? `版型配置: 5行 × N列 (5-20刮) | 格子大小: 16mm`

                                            : layout === 'nine'

                                                ? `版型配置: 3行 × 3列 (固定9格) | 格子大小: 16mm`

                                                : layout === 'lr'

                                                    ? `版型配置: N行 × 5列 (40-60刮) | 格子大小: ${scratches <= 45 ? '20mm' : '16mm'}`

                                                    : `版型配置: 10行 × N列 | 格子大小: 18mm (每頁${fullPageLimit}刮，共${getPagesCount()}頁)`}

                            </p>

                        </div>



                        <div className="flex gap-4">

                            <button

                                onClick={handleRegenerate}

                                className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold text-xl rounded-lg shadow-lg transition transform hover:scale-105"

                            >

                                <RefreshCw size={28} />

                                重新隨機產生

                            </button>


                            <button

                                onClick={handleDownload}

                                className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-bold text-xl rounded-lg shadow-lg transition transform hover:scale-105"

                            >

                                <Download size={28} />

                                下載列印檔案

                            </button>

                        </div>

                    </div>

                </div>

                <ScratchFilmApplicatorGuide />



                <div className="bg-white rounded-lg shadow-xl p-4">

                    <div className="overflow-auto border-2 border-gray-300 rounded">

                        {layout === 'full' && scratches > fullPageLimit ? (

                            <div className="space-y-4 p-4">

                                <p className="text-center font-bold text-lg text-gray-700">

                                    預覽 (共 {getPagesCount()} 頁)

                                </p>

                                {Array.from({ length: getPagesCount() }).map((_, pageIdx) => {

                                    const pageCanvas = document.createElement('canvas');

                                    const ctx = pageCanvas.getContext('2d');

                                    const startOffset = pageIdx * fullPageLimit;

                                    const actualPageScratches = Math.min(fullPageLimit, scratches - startOffset);


                                    // 生成該頁內容

                                    const dpi = 300;

                                    const width = 29.7 * dpi / 2.54;

                                    const height = 21 * dpi / 2.54;

                                    pageCanvas.width = width;

                                    pageCanvas.height = height;


                                    ctx.fillStyle = '#ffffff';

                                    ctx.fillRect(0, 0, width, height);


                                    const cols = 10;

                                    const rows = Math.ceil(actualPageScratches / cols);


                                    drawCardContent(ctx, 0, 0, width, height, pageIdx, rows, cols, '滿', startOffset, actualPageScratches);


                                    return (

                                        <div key={pageIdx} className="border-2 border-gray-300 rounded p-2">

                                            <p className="text-center text-sm font-semibold text-gray-600 mb-2">

                                                第 {pageIdx + 1} 頁 ({startOffset + 1}-{Math.min(startOffset + fullPageLimit, scratches)}刮)

                                            </p>

                                            <img

                                                src={pageCanvas.toDataURL('image/png')}

                                                alt={`第 ${pageIdx + 1} 頁`}

                                                className="max-w-full h-auto mx-auto"

                                                style={{ maxHeight: '600px' }}

                                            />

                                        </div>

                                    );

                                })}

                            </div>

                        ) : (

                            <canvas

                                ref={canvasRef}

                                className="max-w-full h-auto mx-auto"

                                style={{ maxHeight: '700px' }}

                            />

                        )}

                    </div>

                </div>

            </div>

        </div>

    );

};



export default ScratchCardGenerator;
