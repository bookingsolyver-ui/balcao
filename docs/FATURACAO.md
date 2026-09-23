# Cobrar às empresas que usam o Balcão (Paddle)

Isto é **tu a cobrar às empresas** (mensalidade da plataforma) — diferente do que a empresa de mudanças cobra aos clientes dela, que já existia.

## O que foi construído
- Cada negócio nasce com **14 dias de avaliação**, automaticamente (nenhuma ação tua).
- Um cartão no painel mostra o estado: em avaliação (com contagem), ativa, pagamento em atraso, em pausa, cancelada.
- Um botão **Subscrever** abre o checkout do Paddle (só aparece depois de ligares o Paddle — ver abaixo).
- Um recetor de eventos (`/api/webhooks/paddle`) que o Paddle chama sempre que algo muda (pagamento feito, falhou, cancelado) e atualiza o estado sozinho — **verifiquei a assinatura de segurança com um servidor real**: aceita pedidos assinados corretamente, recusa corpo alterado e pedidos sem assinatura.
- O estado de faturação vive numa tabela **isolada e fechada**: o público (visitantes da loja) e outros negócios nunca conseguem lê-la, e nenhum dono de negócio consegue marcar-se a si próprio como "pago" — só o teu servidor, através do recetor de eventos, escreve ali.

## O que ainda NÃO faz (por escolha, para já)
- **Não bloqueia nada.** Se a avaliação expirar ou um pagamento falhar, o negócio continua a funcionar normalmente — só o cartão no painel mostra o aviso. Decidi não cortar o acesso automaticamente até tu decidires como queres lidar com isso (dar mais alguns dias de tolerância? avisar por WhatsApp primeiro?). Quando quiseres isto, é uma alteração pequena.
- **Sem portal de "gerir assinatura"** (cancelar, trocar cartão) dentro do Balcão — por agora, isso faz-se diretamente no Paddle. Dá para adicionar depois.
- **Um preço só.** Não há planos diferentes (básico/pro) — fácil de expandir quando fizer sentido.

## Como ligar (quando estiveres pronto)
1. Cria conta em https://paddle.com, em modo **sandbox** primeiro (para testar sem dinheiro a sério).
2. Em **Catalog > Prices**, cria um preço mensal para "Balcão" — copia o **Price ID** (começa por `pri_`).
3. Em **Developer Tools > Authentication**, copia o **client-side token** (começa por `test_` em sandbox).
4. Em **Developer Tools > Notifications**, cria um destino apontando para `https://o-teu-site.vercel.app/api/webhooks/paddle`, liga os eventos `subscription.*`, e copia o **secret**.
5. No Vercel, acrescenta as 4 variáveis (estão explicadas no `.env.example`): `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_PRICE_ID`, `NEXT_PUBLIC_PADDLE_ENV=sandbox`, `PADDLE_WEBHOOK_SECRET`, e também `SUPABASE_SERVICE_ROLE_KEY` (Supabase > Project Settings > API — **nunca** ponhas esta com o prefixo `NEXT_PUBLIC_`, é secreta).
6. Redeploy sem cache (o mesmo passo que já fizeste para o Supabase).
7. O botão "Subscrever" aparece no painel. Testa com um [cartão de teste do Paddle](https://developer.paddle.com/concepts/payment-methods/test-payment-methods).

## Verificado / não verificado
**Verificado**: toda a lógica (estados, contagem da avaliação, mapeamento de eventos), a segurança da base de dados (153 verificações, incluindo Postgres real: só o dono vê o seu próprio estado, ninguém escreve exceto o servidor), e **o recetor de eventos com um Next.js real a correr** — testei com pedidos assinados corretamente (aceite), corpo alterado (recusado), sem assinatura (recusado) e eventos irrelevantes (ignorados sem erro).
**Só se confirma no teu Paddle real**: o checkout em si (o ecrã onde o cartão é introduzido é do Paddle, não posso testá-lo aqui) e o envio real de um evento a partir de um pagamento de sandbox verdadeiro.
