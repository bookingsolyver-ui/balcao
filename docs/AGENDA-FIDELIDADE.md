# Agenda, fidelidade e loja fechada

## O que há de novo
**Agenda (cabeleireiros e serviços com hora marcada)**
- **Cliente** (loja pública → separador *Serviços*): escolhe serviço → pessoa (ou "qualquer") → dia → hora → nome e WhatsApp. Só aparecem horas **realmente livres** (calculadas no servidor, sem conflitos, no fuso do negócio). Confirmação com **Enviar pelo WhatsApp**, **Adicionar ao calendário** e uma página de **acompanhamento** com cancelamento (`/[locale]/s/[slug]/booking/[token]`).
- **Painel** (`/[locale]/app/agenda`): dia a dia com todas as marcações, ações por estado (confirmar → concluir / faltou / cancelar), lembrete pelo WhatsApp, filtro por pessoa, **nova marcação** feita pelo balcão, **serviços** (duração, preço, ativo), **equipa** e **dias bloqueados** (folgas, feriados).
- **Definições → Agenda · regras**: intervalo entre horários, dias de antecedência, antecedência mínima e confirmação automática (desligada, cada pedido fica *pendente* até confirmares).

**Fidelidade (carimbos ou pontos)**
- **Painel** (`/[locale]/app/loyalty`): pontuar pelo telefone (carimbos ou pontos pelo valor da compra), lista com progresso, **resgatar** quando atinge a meta, histórico, **ajuste** de saldo (admin) e o **programa** (modelo, meta, prémio, pontos por moeda, compra mínima, pontuar automaticamente).
- **Cliente** (loja → *Fidelidade*): cartão estilo Wallet (casas de carimbos ou barra de pontos), atividade, e criação do cartão em segundos.
- Concluir um **pedido** ou uma **marcação** pontua sozinho (se ligado no programa).

**Loja fechada**
- **Definições → Pedidos → "Só aceitar pedidos com a loja aberta"**: fora do horário o cliente vê um aviso e não consegue pedir; o servidor também recusa (`store_closed`). Desligado (predefinição), os pedidos ficam na fila até abrires.

## Aplicar (migração nova!)
```bash
unzip -o ~/Downloads/balcao-final.zip -d .
npm install && npm test
npx supabase db push        # aplica 20260920000005_only_when_open.sql
npm run dev
```
A migração cria `tenant_is_open()`, atualiza `place_order` (loja aberta) e `get_booking` (devolve a loja). Sem ela, a opção da loja fechada não funciona e o acompanhamento das marcações não valida a loja.

## Testar (10 minutos)
1. **Definições**: confirma o horário e o país; se tens o módulo **Agenda** ligado, vê as regras da agenda.
2. **Agenda → Serviços**: cria um serviço (nome, duração, preço). **Equipa**: adiciona pessoas (o negócio já vem com uma).
3. Abre a **loja → Serviços** noutro separador e faz uma marcação com o teu WhatsApp.
4. **Agenda → Dia**: a marcação aparece; confirma/conclui. Ao **concluir**, o cliente ganha um carimbo.
5. **Fidelidade**: pontua uma compra pelo telefone; na loja, abre **Fidelidade**, entra com o mesmo número e vê o cartão.
6. **Definições → Pedidos**: liga "Só aceitar pedidos com a loja aberta", define um horário que já passou e tenta pedir na loja.

## Limitações conhecidas (a resolver antes de escalar)
- **Cartão de fidelidade por telefone, sem código de verificação**: quem souber o número vê o saldo e o primeiro nome. Recomendado: código por SMS/WhatsApp antes de mostrar.
- **Sem limite por IP** nas funções públicas (há limites por telefone: 5 pedidos/hora, 3 marcações em aberto). Recomendado: Turnstile/hCaptcha.
- **Mensagens por WhatsApp são links** (o cliente/negócio toca em enviar). Envio automático exige a API oficial do WhatsApp Business.
- **Pagamentos** só são registados, não cobrados.
- **Cobrança dos negócios** (o teu SaaS) ainda não existe: Stripe ou Paddle.

## Verificado / não verificado
Verificado (Postgres real + renderização + rotas): todas as regras da agenda (marcações no instante certo, conflitos, distribuição por pessoas, cancelamento, o "dia" do fuso do negócio incluindo 23:30/00:00 e mudanças de hora), fidelidade completa (carimbos, pontos em Kz, resgate, ajuste, cartão do cliente, sem duplicar), loja fechada no fuso do negócio, permissões (staff vs. admin vs. público) e todos os ecrãs em 4 idiomas.
**Só no teu Supabase**: as gravações a partir do browser (serviços, equipa, dias bloqueados, estados das marcações, programa de fidelidade), as chamadas `create_booking`/`loyalty_card` pelo PostgREST e o Realtime.
