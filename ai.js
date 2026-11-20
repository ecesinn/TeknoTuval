// ai.js

let tfjsModel = null;
let currentTopPrediction = null;

async function initAI() {
    try {
        $('#ai-status').text('LOADING').removeClass('bg-secondary bg-success bg-danger').addClass('bg-warning text-dark');
        tfjsModel = await mobilenet.load();
        $('#ai-status').text('ONLINE').removeClass('bg-warning text-dark').addClass('bg-success text-white');
    } catch (err) {
        console.error("TFJS MobileNet failed to load:", err);
        $('#ai-status').text('OFFLINE').removeClass('bg-warning text-dark').addClass('bg-danger text-white');
    }
}

$(document).ready(() => {
    initAI();

    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        $('#geminiApiKey').val(savedKey);
    }

    $('#btnSaveApiKey').on('click', () => {
        const apiKey = $('#geminiApiKey').val().trim();
        if (apiKey) {
            localStorage.setItem('gemini_api_key', apiKey);
            alert('Gemini API Key configured successfully!');
        } else {
            localStorage.removeItem('gemini_api_key');
            alert('API Key removed.');
        }
        $('#settingsModal').modal('hide');
    });


    $('#btnGenMasterpiece').on('click', async () => {
        const canvas = document.getElementById('drawingCanvas');
        let userPrompt = $('#aiArtPrompt').val().trim();
        
        if (!userPrompt) {
            if (currentTopPrediction) {
                userPrompt = `A stunning digital artwork of a ${currentTopPrediction}, creative concept`;
            } else {
                userPrompt = "A beautiful surreal line drawing artwork, highly detailed";
            }
            $('#aiArtPrompt').val(userPrompt);
        }


        $('#aiArtSpinner').removeClass('d-none');
        $('#aiArtImg').hide();
        $('#aiArtPlaceholder').hide();

        const apiKey = localStorage.getItem('gemini_api_key');
        
    
        if (apiKey && userPrompt) {
            try {
                const base64Img = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
                const enhancementPayload = {
                    contents: [{
                        parts: [
                            { text: `Look at this canvas drawing. The user wants to generate a masterpiece using the description: '${userPrompt}'. Formulate a highly detailed, descriptive 1-sentence prompt for a text-to-image generator. Combine their drawing layout/shape with their style description. Return ONLY the final prompt text. Do not write anything else.` },
                            {
                                inlineData: {
                                    mimeType: "image/jpeg",
                                    data: base64Img
                                }
                            }
                        ]
                    }]
                };

                const enhanced = await callGeminiAPI(apiKey, enhancementPayload);
                if (enhanced && enhanced.trim()) {
                    userPrompt = enhanced.trim();
                    console.log("Enhanced prompt by Gemini:", userPrompt);
                }
            } catch (err) {
                console.warn("Failed to enhance prompt with Gemini, falling back to original:", err);
            }
        }

       
        const seed = Math.floor(Math.random() * 1000000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(userPrompt)}?width=600&height=600&nologo=true&seed=${seed}`;
        
        const tempImg = new Image();
        tempImg.onload = () => {
            $('#aiArtImg').attr('src', imageUrl).fadeIn();
            $('#aiArtSpinner').addClass('d-none');
        };
        tempImg.onerror = () => {
            $('#aiArtSpinner').addClass('d-none');
            $('#aiArtPlaceholder').show().html('<span class="text-danger small"><i class="bi bi-exclamation-triangle-fill"></i> Generation failed. Try again!</span>');
        };
        tempImg.src = imageUrl;
    });

    

    $('#btnCritique').on('click', async () => {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            alert('Please configure your Gemini API Key in the settings first to use this feature.');
            $('#settingsModal').modal('show');
            return;
        }

        const canvas = document.getElementById('drawingCanvas');
        const $critiqueBox = $('#geminiCritiqueResult');
        const $btn = $('#btnCritique');

        $critiqueBox.removeClass('d-none').html('<span class="text-muted"><i class="bi bi-hourglass-split"></i> Awaiting critique from Gemini...</span>');
        $btn.prop('disabled', true).text('Critiquing...');

        try {
            const base64Img = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
            const payload = {
                contents: [{
                    parts: [
                        { text: "Look at this canvas drawing. Write a short, engaging, and witty evaluation (max 3 sentences) in the style of an art critic. Identify what it seems to represent, rate its creativity, and suggest a creative title for it." },
                        {
                            inlineData: {
                                mimeType: "image/jpeg",
                                data: base64Img
                            }
                        }
                    ]
                }]
            };

            const responseText = await callGeminiAPI(apiKey, payload);
            $critiqueBox.html(`<div class="text-white"><strong>🎨 Gemini's Critique:</strong></div><div class="mt-1 small text-info">${escapeHtml(responseText)}</div>`);
        } catch (error) {
            console.error("Critique API Call failed:", error);
            $critiqueBox.html(`<span class="text-danger small"><i class="bi bi-exclamation-triangle-fill"></i> Critique failed: ${escapeHtml(error.message)}</span>`);
        } finally {
            $btn.prop('disabled', false).html('<i class="bi bi-eye-fill"></i> Critique Canvas Drawing');
        }
    });

    

    $('#btnAutoDraw').on('click', async () => {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            alert('Please configure your Gemini API Key in the settings first to use this feature.');
            $('#settingsModal').modal('show');
            return;
        }

        const promptText = $('#autoDrawPrompt').val().trim();
        if (!promptText) {
            alert('Please enter a sketch concept (e.g. "a cat face", "a sailboat") for Gemini to draw!');
            return;
        }

        const $btn = $('#btnAutoDraw');
        $btn.prop('disabled', true).text('Gemini is sketching...');

        try {
            const systemInstructions = `You are a drawing assistant. Generate a simple outline sketch in JSON format for: "${promptText}". 
The coordinate space is 600x600. 
Respond with ONLY a raw JSON array of stroke objects. Do not include markdown \`\`\`json wrappers. 
Each stroke object must match this signature exactly:
{
  "shape": "freehand",
  "color": "#00d2ff",
  "size": 4,
  "points": [{"x": 100, "y": 120}, {"x": 105, "y": 125}, ...]
}
Produce a recognizable outline using 3 to 10 strokes. Keep point counts per stroke minimal (5-15 points) for smooth drawing animation. Keep all coordinates inside bounds [0, 600].`;

            const payload = {
                contents: [{
                    parts: [{ text: systemInstructions }]
                }]
            };

            const responseRaw = await callGeminiAPI(apiKey, payload);
            const cleanedJSON = cleanJSONResponse(responseRaw);
            const strokes = JSON.parse(cleanedJSON);

            if (Array.isArray(strokes) && window.loadStrokesDynamically) {
                await window.loadStrokesDynamically(strokes);
            } else {
                throw new Error("Parsed data is not an array");
            }
        } catch (error) {
            console.error("Auto-Draw error:", error);
            alert("Gemini failed to compile coordinate drawings. Make sure the API key is active and try again.");
        } finally {
            $btn.prop('disabled', false).html('<i class="bi bi-stars"></i> Ask Gemini to Draw');
        }
    });
});



async function callGeminiAPI(apiKey, payload) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        let errorMsg = `HTTP Error ${response.status}`;
        try {
            const errJson = await response.json();
            if (errJson.error && errJson.error.message) {
                errorMsg = errJson.error.message;
            }
        } catch (e) {}
        throw new Error(errorMsg);
    }
    
    const data = await response.json();
    if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
        return data.candidates[0].content.parts[0].text;
    }
    throw new Error("Unexpected API response shape");
}

function cleanJSONResponse(rawText) {
    let text = rawText.trim();
    if (text.startsWith("```")) {
        text = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
    }
    return text.trim();
}

function escapeHtml(string) {
    return String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


window.triggerAIAnalysis = async function(canvasElement) {
    if (!tfjsModel) return;

    $('#ai-status').text('GUESSING').removeClass('bg-success bg-danger').addClass('bg-warning text-dark');
    $('#ai-results').html('<span class="text-muted small">Neural processing...</span>');

    try {
        const predictions = await tfjsModel.classify(canvasElement, 3);

        if (predictions && predictions.length > 0) {
            currentTopPrediction = predictions[0].className.split(',')[0];
            let html = '';
            predictions.forEach(p => {
                const percent = (p.probability * 100).toFixed(1);
                html += `
                    <div class="mb-2">
                        <div class="d-flex justify-content-between small text-white">
                            <strong class="text-capitalize">${p.className.split(',')[0]}</strong>
                            <span class="text-info">${percent}%</span>
                        </div>
                        <div class="progress" style="height: 5px; background-color: rgba(255, 255, 255, 0.08);">
                            <div class="progress-bar bg-info" role="progressbar" style="width: ${percent}%;" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"></div>
                        </div>
                    </div>
                `;
            });
            $('#ai-results').html(html);
        } else {
            currentTopPrediction = null;
            $('#ai-results').html('<span class="text-muted small">No visual shapes classified.</span>');
        }
        $('#ai-status').text('ONLINE').removeClass('bg-warning text-dark').addClass('bg-success text-white');
    } catch (error) {
        console.error("Local classification error:", error);
        $('#ai-status').text('OFFLINE').removeClass('bg-warning text-dark bg-success').addClass('bg-danger text-white');
        $('#ai-results').html('<span class="text-danger small">Prediction error.</span>');
    }
};




