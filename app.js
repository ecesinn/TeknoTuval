// app.js

$(document).ready(function() {
    const canvas = document.getElementById('drawingCanvas');
    const ctx = canvas.getContext('2d');
    
    
    let isDrawing = false;
    let paths = []; 
    let redoStack = []; 
    let currentPath = null;
    let analysisTimeout = null;
    let rainbowHue = 0;

   
    let activeBrush = 'pencil';
    let activeShape = 'freehand';
    let strokeColor = '#00d2ff';
    let strokeSize = 5;
    let symType = 'none';
    let radialSegments = 8;

    
    redrawCanvas();

    
    $('.brush-selector').on('click', function() {
        $('.brush-selector').removeClass('active');
        $(this).addClass('active');
        activeBrush = $(this).data('brush');
    });

    $('.shape-selector').on('click', function() {
        $('.shape-selector').removeClass('active');
        $(this).addClass('active');
        activeShape = $(this).data('shape');
    });

    $('.palette-swatch').on('click', function() {
        $('.palette-swatch').removeClass('active');
        $(this).addClass('active');
        const color = $(this).data('color');
        $('#colorPicker').val(color);
        strokeColor = color;
        $('#colorHexVal').text(color.toUpperCase());
    });

    $('#colorPicker').on('input change', function(e) {
        strokeColor = e.target.value;
        $('#colorHexVal').text(strokeColor.toUpperCase());
        $('.palette-swatch').removeClass('active');
    });

    $('#sizePicker').on('input', function(e) {
        strokeSize = parseInt(e.target.value);
        $('#sizeVal').text(strokeSize + 'px');
    });

    $('#bgSelect').on('change', function() {
        redrawCanvas();
    });

    $('#gridSwitch').on('change', function() {
        redrawCanvas();
    });

    $('#symmetrySelect').on('change', function() {
        symType = $(this).val();
        if (symType === 'radial') {
            $('#radialSegmentsGroup').removeClass('d-none');
        } else {
            $('#radialSegmentsGroup').addClass('d-none');
        }
    });

    $('#radialSegments').on('input', function(e) {
        radialSegments = parseInt(e.target.value);
        $('#radialVal').text(radialSegments);
    });

    

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    function getSymmetricPoints(x, y, symSettings) {
        const points = [{ x, y }];
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        
        if (!symSettings || symSettings.type === 'none') {
            return points;
        }
        
        if (symSettings.type === 'vertical') {
            points.push({ x: cx * 2 - x, y: y });
        } else if (symSettings.type === 'horizontal') {
            points.push({ x: x, y: cy * 2 - y });
        } else if (symSettings.type === 'radial') {
            const segments = symSettings.segments || 8;
            const dx = x - cx;
            const dy = y - cy;
            const r = Math.sqrt(dx * dx + dy * dy);
            const baseAngle = Math.atan2(dy, dx);
            const step = (2 * Math.PI) / segments;
            
            points.length = 0; 
            for (let i = 0; i < segments; i++) {
                const angle = baseAngle + i * step;
                points.push({
                    x: cx + r * Math.cos(angle),
                    y: cy + r * Math.sin(angle)
                });
                
               
                const mirrorAngle = -baseAngle + i * step;
                points.push({
                    x: cx + r * Math.cos(mirrorAngle),
                    y: cy + r * Math.sin(mirrorAngle)
                });
            }
        }
        return points;
    }

    

    function drawGrid() {
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.12)';
        ctx.lineWidth = 1;
        const spacing = 30;
        
        for (let x = spacing; x < canvas.width; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = spacing; y < canvas.height; y += spacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }

    function drawPath(pathOp) {
        const brush = pathOp.brush || 'pencil';
        const shape = pathOp.shape || 'freehand';
        const size = pathOp.size || 5;
        const symSettings = pathOp.symmetry || { type: 'none' };
        
       
        let color = pathOp.color;
        if (brush === 'eraser') {
            color = $('#bgSelect').val() || '#ffffff';
        }
        
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (shape === 'freehand') {
            if (brush === 'spray') {
                pathOp.points.forEach(pt => {
                    const symPts = getSymmetricPoints(pt.x, pt.y, symSettings);
                    symPts.forEach(sPt => {
                        ctx.fillRect(sPt.x, sPt.y, 1, 1);
                    });
                });
            } else {
                if (pathOp.points.length < 1) return;
                
                if (pathOp.points.length === 1) {
                    const pt = pathOp.points[0];
                    const symPts = getSymmetricPoints(pt.x, pt.y, symSettings);
                    symPts.forEach(sPt => {
                        ctx.beginPath();
                        ctx.arc(sPt.x, sPt.y, size / 2, 0, 2 * Math.PI);
                        ctx.fill();
                    });
                    return;
                }
                
                for (let i = 1; i < pathOp.points.length; i++) {
                    const from = pathOp.points[i - 1];
                    const to = pathOp.points[i];
                    
                    if (to.color) ctx.strokeStyle = to.color;
                    else ctx.strokeStyle = color;
                    
                    if (to.width) ctx.lineWidth = to.width;
                    else ctx.lineWidth = size;
                    
                    ctx.globalAlpha = (brush === 'marker') ? 0.4 : 1.0;
                    
                    const fromPts = getSymmetricPoints(from.x, from.y, symSettings);
                    const toPts = getSymmetricPoints(to.x, to.y, symSettings);
                    
                    for (let k = 0; k < fromPts.length; k++) {
                        ctx.beginPath();
                        ctx.moveTo(fromPts[k].x, fromPts[k].y);
                        ctx.lineTo(toPts[k].x, toPts[k].y);
                        ctx.stroke();
                    }
                }
                ctx.globalAlpha = 1.0;
            }
        } else {
            
            if (pathOp.points.length < 2) return;
            const start = pathOp.points[0];
            const end = pathOp.points[pathOp.points.length - 1];
            
            const startPts = getSymmetricPoints(start.x, start.y, symSettings);
            const endPts = getSymmetricPoints(end.x, end.y, symSettings);
            
            ctx.globalAlpha = (brush === 'marker') ? 0.4 : 1.0;
            
            for (let k = 0; k < startPts.length; k++) {
                const sPt = startPts[k];
                const ePt = endPts[k];
                
                ctx.beginPath();
                if (shape === 'line') {
                    ctx.moveTo(sPt.x, sPt.y);
                    ctx.lineTo(ePt.x, ePt.y);
                    ctx.stroke();
                } else if (shape === 'rect') {
                    ctx.strokeRect(sPt.x, sPt.y, ePt.x - sPt.x, ePt.y - sPt.y);
                } else if (shape === 'circle') {
                    const r = Math.sqrt(Math.pow(ePt.x - sPt.x, 2) + Math.pow(ePt.y - sPt.y, 2));
                    ctx.arc(sPt.x, sPt.y, r, 0, 2 * Math.PI);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1.0;
        }
    }

    function redrawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Fill canvas background
        const bgColor = $('#bgSelect').val() || '#ffffff';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
       
        if ($('#gridSwitch').is(':checked')) {
            drawGrid();
        }
        
        
        paths.forEach(drawPath);
        
        
        if (isDrawing && currentPath && currentPath.shape !== 'freehand') {
            drawPath(currentPath);
        }
    }

   

    function startDrawing(e) {
        isDrawing = true;
        const pos = getMousePos(e);
        
        currentPath = {
            brush: activeBrush,
            shape: activeShape,
            color: strokeColor,
            size: strokeSize,
            points: [pos],
            symmetry: {
                type: symType,
                segments: radialSegments
            }
        };

       
        if (activeShape === 'freehand' && activeBrush === 'spray') {
            generateSprayDots(pos);
            redrawCanvas();
        }

        redoStack = []; 
    }

    function draw(e) {
        if (!isDrawing || !currentPath) return;
        const pos = getMousePos(e);

        if (currentPath.shape === 'freehand') {
            const lastPos = currentPath.points[currentPath.points.length - 1];
            
            if (currentPath.brush === 'spray') {
                generateSprayDots(pos);
            } else if (currentPath.brush === 'rainbow') {
                rainbowHue = (rainbowHue + 3) % 360;
                const pointColor = `hsl(${rainbowHue}, 100%, 50%)`;
                currentPath.points.push({ x: pos.x, y: pos.y, color: pointColor });
            } else if (currentPath.brush === 'calligraphy') {
                const angle = Math.atan2(pos.y - lastPos.y, pos.x - lastPos.x);
                const calligWidth = Math.abs(Math.sin(angle - Math.PI / 4)) * strokeSize + 2;
                currentPath.points.push({ x: pos.x, y: pos.y, width: calligWidth });
            } else {
                
                currentPath.points.push(pos);
            }
            
          
            if (currentPath.brush !== 'spray') {
                const recentPt = currentPath.points[currentPath.points.length - 1];
                const prevPt = currentPath.points[currentPath.points.length - 2];
                
               
                ctx.save();
                let segColor = currentPath.color;
                if (currentPath.brush === 'eraser') {
                    segColor = $('#bgSelect').val() || '#ffffff';
                }
                ctx.strokeStyle = recentPt.color || segColor;
                ctx.lineWidth = recentPt.width || currentPath.size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.globalAlpha = (currentPath.brush === 'marker') ? 0.4 : 1.0;
                
                const fromPts = getSymmetricPoints(prevPt.x, prevPt.y, currentPath.symmetry);
                const toPts = getSymmetricPoints(recentPt.x, recentPt.y, currentPath.symmetry);
                
                for (let k = 0; k < fromPts.length; k++) {
                    ctx.beginPath();
                    ctx.moveTo(fromPts[k].x, fromPts[k].y);
                    ctx.lineTo(toPts[k].x, toPts[k].y);
                    ctx.stroke();
                }
                ctx.restore();
            } else {
                redrawCanvas();
            }
        } else {
          
            if (currentPath.points.length === 1) {
                currentPath.points.push(pos);
            } else {
                currentPath.points[1] = pos;
            }
            redrawCanvas();
        }
    }

    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        
        if (currentPath && currentPath.points.length > 0) {
            paths.push(currentPath);
            currentPath = null;
        }
        
        redrawCanvas();

        
        if (window.triggerAIAnalysis) {
            clearTimeout(analysisTimeout);
            analysisTimeout = setTimeout(() => {
                window.triggerAIAnalysis(canvas);
            }, 800);
        }
    }

    function generateSprayDots(centerPos) {
        const dotsCount = 8 + Math.floor(strokeSize / 3);
        const radius = strokeSize * 1.5;
        for (let i = 0; i < dotsCount; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const r = Math.random() * radius;
            const px = centerPos.x + r * Math.cos(angle);
            const py = centerPos.y + r * Math.sin(angle);
            currentPath.points.push({ x: px, y: py });
        }
    }

    $(canvas).on('mousedown', startDrawing);
    $(canvas).on('mousemove', draw);
    $(canvas).on('mouseup mouseleave', stopDrawing);

    

    $('#btnUndo').on('click', () => {
        if (paths.length > 0) {
            const path = paths.pop();
            redoStack.push(path);
            redrawCanvas();
            
            if (window.triggerAIAnalysis) {
                window.triggerAIAnalysis(canvas);
            }
        }
    });

    $('#btnRedo').on('click', () => {
        if (redoStack.length > 0) {
            const path = redoStack.pop();
            paths.push(path);
            redrawCanvas();
            if (window.triggerAIAnalysis) {
                window.triggerAIAnalysis(canvas);
            }
        }
    });

    $('#btnClear').on('click', () => {
        paths = [];
        redoStack = [];
        redrawCanvas();
        $('#ai-results').html('<span class="text-muted small">Awaiting sketches...</span>');
    });

    

    $('#btnSaveLocal').on('click', () => {
        localStorage.setItem('aiCreativeStudioPaths', JSON.stringify({
            paths: paths,
            bgColor: $('#bgSelect').val(),
            gridEnabled: $('#gridSwitch').is(':checked')
        }));
        alert('Artwork successfully saved in local browser storage!');
    });

    $('#btnLoadLocal').on('click', () => {
        const data = localStorage.getItem('aiCreativeStudioPaths');
        if (data) {
            loadSavedArt(JSON.parse(data));
        } else {
            alert('No saved artwork found in browser storage.');
        }
    });

    $('#btnDownload').on('click', () => {
        const dataToSave = {
            paths: paths,
            bgColor: $('#bgSelect').val(),
            gridEnabled: $('#gridSwitch').is(':checked')
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToSave));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", "creative_studio_artwork.json");
        dlAnchor.click();
    });

    $('#btnUpload').on('click', () => {
        $('#fileUpload').click();
    });

    $('#fileUpload').on('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed.paths) {
                    loadSavedArt(parsed);
                } else {
                    alert('Invalid file format. Make sure it is an AI Creative Studio exported JSON.');
                }
            } catch(err) {
                alert('Invalid JSON file.');
            }
        };
        reader.readAsText(file);
        $(this).val(''); 
    });

    function loadSavedArt(savedObj) {
        paths = savedObj.paths || [];
        redoStack = [];
        
        if (savedObj.bgColor) {
            $('#bgSelect').val(savedObj.bgColor);
        }
        if (savedObj.gridEnabled !== undefined) {
            $('#gridSwitch').prop('checked', savedObj.gridEnabled);
        }
        
        redrawCanvas();
        if (window.triggerAIAnalysis) {
            window.triggerAIAnalysis(canvas);
        }
    }

    
    window.loadStrokesDynamically = async function(strokesArray) {
        paths = [];
        redoStack = [];
        redrawCanvas();
        
       
        for (let stroke of strokesArray) {
            const pts = stroke.points || [];
            if (pts.length === 0) continue;
            
            const newPath = {
                brush: 'pencil',
                shape: stroke.shape || 'freehand',
                color: stroke.color || '#00d2ff',
                size: stroke.size || 4,
                points: [pts[0]],
                symmetry: { type: 'none' } // Auto draw doesn't force client side symmetry reflections
            };
            
            paths.push(newPath);
            
           
            for (let i = 1; i < pts.length; i++) {
                await new Promise(resolve => setTimeout(resolve, 35)); // delay to simulate actual drawing
                newPath.points.push(pts[i]);
                redrawCanvas();
            }
        }
        
        
        if (window.triggerAIAnalysis) {
            window.triggerAIAnalysis(canvas);
        }
    };
});
