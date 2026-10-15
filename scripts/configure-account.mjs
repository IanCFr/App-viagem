import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { spawn } from 'node:child_process';

if (!process.stdin.isTTY) throw new Error('Execute em um terminal interativo. Para automação, use npm run account com JSON por stdin.');
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const email = (await prompt.question('E-mail da conta compartilhada: ')).trim();
prompt.close();
async function password(label) {
  process.stdout.write(label); process.stdin.resume(); emitKeypressEvents(process.stdin); process.stdin.setRawMode(true);
  return new Promise(resolve => {
    let value = '';
    const handler = (text, key) => {
      if (key?.ctrl && key?.name === 'c') { process.stdin.setRawMode(false); process.stdout.write('\n'); process.exit(1); }
      if (key?.name === 'return') { process.stdin.off('keypress', handler); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); resolve(value); }
      else if (key?.name === 'backspace') { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); } }
      else if (text && !key?.ctrl && !key?.meta && !text.includes('\u001b')) { value += text; process.stdout.write('*'.repeat(text.length)); }
    };
    process.stdin.on('keypress', handler);
  });
}
const secret = await password('Senha (mínimo de 12 caracteres): ');
const confirmation = await password('Confirme a senha: ');
if (secret !== confirmation || secret.length < 12) throw new Error('As senhas precisam coincidir e ter pelo menos 12 caracteres.');
const child = spawn(process.execPath, ['--import', 'tsx', 'server/account.ts'], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.end(JSON.stringify({ email, password: secret }));
child.on('exit', code => process.exit(code ?? 1));
