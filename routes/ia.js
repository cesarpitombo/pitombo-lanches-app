const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const multer = require('multer');

const uploadMem = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 }
});

// Inicializa a configuração, permitindo nulo se a chave não existir ainda
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sk-chave-simulada'
});

// POST /api/ia/gerar-descricao
router.post('/gerar-descricao', async (req, res) => {
    const { nome, categoria, ingredientes_atuais } = req.body;

    if (!nome) {
        return res.status(400).json({ error: 'O nome do produto é obrigatório para gerar uma descrição.' });
    }

    try {
        // Se o usuário ainda não colocou a chave real no .env, devolvemos um Mock/Simulação estático para ele testar o fluxo visual
        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '') {
            console.log('⚠️ OPENAI_API_KEY não configurada. Usando MOCK de descrição.');
            const mockDesc = `O delicioso ${nome} da categoria ${categoria || 'geral'} chegou! Feito com os melhores ingredientes combinando sabor e qualidade excepcionais para matar sua fome de forma inesquecível. Experiência única!`;
            
            // Simular um atraso na internet de 2 segundos para o Front exibir o "Pensando..." corretamente
            await new Promise(r => setTimeout(r, 1500));
            return res.json({ success: true, descricao: mockDesc, isMock: true });
        }

        // --- Integração Real com OpenAI ---
        const promptText = `
Você é um copywriter de marketing especialista em hamburguerias e lanches. 
Crie uma descrição comercial curta, muito atrativa e apetitosa (no máximo 3 a 4 linhas) para o seguinte produto:

Nome do Produto: ${nome}
${categoria ? `Categoria do Cardápio: ${categoria}` : ''}
${ingredientes_atuais ? `Ingredientes conhecidos / Rascunho atual: ${ingredientes_atuais}` : ''}

Retorne APENAS o texto da descrição para eu colar direto no cardápio, sem aspas, evite formatações complexas. Evite repetir o nome do produto no início se não for natural. Foco em dar água na boca!
        `.trim();

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // modelo rápido e super barato
            messages: [
                { role: "system", content: "Você é um assistente especialista em criação de textos comerciais gastronômicos focados em conversão." },
                { role: "user", content: promptText }
            ],
            max_tokens: 150,
            temperature: 0.7,
        });

        const descricaoGerada = completion.choices[0].message.content.trim();
        
        res.json({ success: true, descricao: descricaoGerada, isMock: false });
        
    } catch (err) {
        console.error('Erro na rota gerar-descricao IA:', err.message);
        res.status(500).json({ error: 'Erro ao gerar texto na inteligência artificial: ' + err.message });
    }
});

// POST /api/ia/melhorar-imagem
router.post('/melhorar-imagem', uploadMem.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    try {
        const hasRealKey = process.env.OPENAI_API_KEY &&
            process.env.OPENAI_API_KEY.trim() !== '' &&
            process.env.OPENAI_API_KEY !== 'sk-chave-simulada';

        if (!hasRealKey) {
            console.log('⚠️ OPENAI_API_KEY não configurada. Retornando mock para melhorar-imagem.');
            await new Promise(r => setTimeout(r, 2000));
            return res.json({
                success: true,
                imageBase64: `data:image/png;base64,${req.file.buffer.toString('base64')}`,
                isMock: true
            });
        }

        const imageFile = new File([req.file.buffer], 'produto.png', { type: 'image/png' });

        const response = await openai.images.edit({
            model: 'dall-e-2',
            image: imageFile,
            prompt: 'Professional food photography enhancement: improve lighting, sharpness, vibrancy and colors. Keep exact same food items, plate and composition. Make it look appetizing and photorealistic.',
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json'
        });

        res.json({
            success: true,
            imageBase64: `data:image/png;base64,${response.data[0].b64_json}`,
            isMock: false
        });

    } catch (err) {
        console.error('Erro na rota melhorar-imagem IA:', err.message);
        res.status(500).json({ error: 'Erro ao processar imagem na IA: ' + err.message });
    }
});

module.exports = router;
