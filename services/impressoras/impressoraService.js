const net = require('net');
const { exec } = require('child_process');

/**
 * Utilitário de Impressoras Térmicas
 * Implementa comunicação crua TCP (Porta 9100) e interface CLI com Windows Spooler.
 */

// 1. Testar conexão TCP de rede
function pingImpressoraRede(ip, porta = 9100, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            socket.destroy();
            resolve({ ok: true, status: 'online', message: 'Conexão TCP estabelecida com sucesso' });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ ok: false, status: 'offline', message: 'Timeout: Porta fechada ou rede inacessível' });
        });

        socket.on('error', (err) => {
            socket.destroy();
            resolve({ ok: false, status: 'erro', message: `Falha na conexão: ${err.message}` });
        });

        socket.connect(porta, ip);
    });
}

// 2. Localizar impressoras Windows
function scanImpressorasWindows() {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve({ ok: false, impressoras: [], message: 'O auto-scan USB só está disponível no Windows no momento.' });
        }

        // Usa wmic (Windows Management Instrumentation) para ler os devices
        exec('wmic printer get name, portname, printerstatus /value', (erro, stdout, stderr) => {
            if (erro || stderr) {
                return resolve({ ok: false, impressoras: [], message: 'Falha ao rodar WMIC. Certifique-se de ser administrador.' });
            }

            const linhas = stdout.split('\\n').map(l => l.trim()).filter(l => l);
            const printers = [];
            let pData = {};

            linhas.forEach(linha => {
                const [chave, ...rest] = linha.split('=');
                const valor = rest.join('=');
                if (chave && valor !== undefined) pData[chave.trim()] = valor.trim();

                if (pData.Name && pData.PortName && pData.PrinterStatus !== undefined) {
                    printers.push({
                        nome: pData.Name,
                        porta: pData.PortName,
                        tipo_conexao: 'windows',
                        status: pData.PrinterStatus === '3' ? 'online' : 'desconhecido'
                    });
                    pData = {};
                }
            });

            resolve({ ok: true, impressoras: printers });
        });
    });
}

// 3. Enviar ticket teste ESC/POS via Rede
async function enviarTesteRede(ip, porta = 9100, larguraMm = 80) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);

        socket.on('connect', () => {
            // Buffer básico de comando ESC/POS
            // Inicializar: ESC @
            // Alinhamento central: ESC a 1
            // Negrito: ESC E 1
            // Cortar papel: GS V 0
            
            const breakLine = '\\x0A';
            const escInit = '\\x1B\\x40';
            const escCenter = '\\x1B\\x61\\x01';
            const escLeft = '\\x1B\\x61\\x00';
            const boldOn = '\\x1B\\x45\\x01';
            const boldOff = '\\x1B\\x45\\x00';
            const cutPaper = '\\x1D\\x56\\x00';

            const larguraCols = larguraMm === 58 ? 32 : 48;
            const divisoria = '-'.repeat(larguraCols) + breakLine;

            const ticket = 
                escInit +
                escCenter + boldOn + "PITOMBO LANCHES" + boldOff + breakLine +
                "TICKET DE TESTE" + breakLine + breakLine +
                escLeft +
                divisoria +
                "Data: " + new Date().toLocaleString('pt-BR') + breakLine +
                "Impressora configurada com sucesso!" + breakLine +
                "Largura: " + larguraMm + "mm" + breakLine +
                divisoria + breakLine + breakLine + breakLine +
                cutPaper;

            try {
                // Node trata string como UTF-8 ou buffer ASCII. Usando ASCII simples para POS térmico.
                socket.write(ticket, 'ascii', () => {
                    socket.destroy();
                    resolve({ ok: true, message: 'Ticket de teste enviado para o IP com sucesso.' });
                });
            } catch(e) {
                socket.destroy();
                resolve({ ok: false, message: 'Erro ao emitir buffer: ' + e.message });
            }
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ ok: false, message: 'Timeout: Impressora de rede não conectou a tempo.' });
        });

        socket.on('error', (err) => {
            socket.destroy();
            resolve({ ok: false, message: 'Erro TCP/IP: ' + err.message });
        });

        socket.connect(porta, ip);
    });
}

// 4. Enviar ticket teste para Fila Local (Windows Spooler)
function enviarTesteWindows(printerName) {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve({ ok: false, message: 'O Spooler local requer sistema operacional Windows.' });
        }
        
        // Salvando um arquivo TXT bruto local no Tmp para despachar pro USB
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        const ticketFile = path.join(os.tmpdir(), "pitombo_teste_print.txt");
        const conteudo = "\\n\\n      PITOMBO LANCHES\\n      TICKET DE TESTE\\n--------------------------------\\nData: " + new Date().toLocaleString() + "\\nImpressora: " + printerName + "\\n\\nA Comunicacao via Spooler do Windows\\nestabelencida com sucesso!\\n--------------------------------\\n\\n\\n\\n";
        
        try {
            fs.writeFileSync(ticketFile, conteudo, 'utf8');
            
            // Usar PowerShell para mandar o arquivo de texto para a porta/impressora especificada.
            // O comando print nativo do CMD funciona se o driver permitir raw text
            // Outra via universal: Get-Content file | Out-Printer -Name "Nome"
            const shellCommand = `powershell -Command "Get-Content '${ticketFile}' | Out-Printer -Name '${printerName}'"`;
            
            exec(shellCommand, (erro, stdout, stderr) => {
                if (erro) {
                    return resolve({ ok: false, message: 'Falha no PowerShell Out-Printer: ' + erro.message });
                }
                resolve({ ok: true, message: 'Teste enviado para fila de impressão USB/Local do Windows.' });
            });
            
        } catch(e) {
            resolve({ ok: false, message: 'Erro ao criar arquivo buffer local: ' + e.message });
        }
    });
}

module.exports = {
    pingImpressoraRede,
    scanImpressorasWindows,
    enviarTesteRede,
    enviarTesteWindows
};
