# Nicho: Mudanças e transportes

Pensado para uma empresa de mudanças em Portugal que hoje usa Excel. Substitui a folha de cálculo por um sistema onde o cliente pede o orçamento sozinho (com m³, moradas e observações), e o preço só é dado depois de a equipa analisar tudo — exatamente como pediste.

## O que há de novo

**Cliente (loja pública → separador "Orçamento")**
- Escolhe o tipo de mudança (casa, escritório, só alguns móveis).
- Indica o **volume em m³**, com ajuda: escolher uma tipologia (T0, T1, T2…) preenche uma estimativa.
- Preenche **morada de origem e destino** completas: rua, localidade, código postal (com validação do formato português `0000-000`), andar e se há elevador.
- Escolhe **serviços extra** (embalagem, desmontagem de móveis, grua, armazenamento…) e assinala **itens especiais** (piano, cofre, aquário…) configuráveis pela empresa.
- Indica uma **data preferida** (opcional, com opção de flexibilidade) e um período (manhã/tarde/indiferente).
- Escreve **observações importantes** (até 2000 caracteres) — o campo que pediste para "observações importantes da mudança".
- Tem de **autorizar o contacto** antes de enviar (consentimento explícito).
- No fim, envia tudo para a empresa **pelo WhatsApp** (mensagem pronta com todos os dados) e fica com uma página de **acompanhamento**.
- **O preço nunca aparece nesta fase.** Só quando a empresa envia o orçamento é que o cliente o vê na página de acompanhamento, com botões para **aceitar** ou **recusar**.

**Empresa (painel → "Mudanças")**
- Fila por estado: Novos → Visita → Orçamentado → Aceite → Confirmado (mais Concluído e Perdido no histórico).
- Cada pedido mostra nome, contacto, volume, moradas, extras, itens especiais e as observações do cliente.
- **Enviar orçamento**: a empresa escreve o valor e uma nota; só aí o preço fica visível ao cliente.
- **Confirmar mudança**: define a data confirmada, o período e a equipa responsável.
- **Notas internas** (só visíveis à equipa, nunca ao cliente) para registar o que for preciso.
- Botão de **WhatsApp** em cada pedido, com a mensagem certa para cada fase.
- **Exportar para Excel**: um botão descarrega um CSV com todos os pedidos, pronto a abrir no Excel (separador `;`, acentos corretos). É o que substitui a folha de cálculo atual.
- Atualiza sozinho (tempo real), como a fila de pedidos do cardápio.

**Definições → "Mudanças · regras"**
- Capacidade: quantas mudanças confirmadas cabem no mesmo dia (impede sobrelotar a equipa).
- Preço indicativo por m³, preço mínimo e acréscimo por andar sem elevador — **é só uma sugestão para orientar a equipa**; o valor final que o cliente vê é sempre o que a empresa escrever à mão ao enviar o orçamento.
- Tipologias (T0, T1, T2…) com o m³ típico de cada uma, para o cliente que não sabe o volume.
- Serviços extra e os seus preços, itens especiais, nomes das equipas e o link da política de privacidade.

## Aplicar (migração nova!)
```bash
unzip -o ~/Downloads/balcao-mudancas.zip -d .
npm install && npm test
npx supabase db push        # aplica 20260921000006_moving.sql
npm run dev
```

## Criar o negócio da empresa de mudanças
No onboarding (`/app/onboarding`), escolhe o tipo de negócio **"Mudanças e transportes"**. Isto liga automaticamente só o módulo de mudanças (sem cardápio, agenda, catálogo ou fidelidade — podes ligar fidelidade depois nas Definições, se quiseres pontuar clientes recorrentes).

## Testar (10 minutos)
1. Cria o negócio com o nicho de mudanças, país Portugal.
2. Em **Definições → Mudanças · regras**, ajusta a capacidade diária e, se quiseres, os preços indicativos e as tipologias.
3. Abre a loja, separador **Orçamento**, e faz um pedido de teste com o teu WhatsApp: escolhe T2, preenche as moradas, marca "Piano" e escreve uma observação.
4. No painel, **Mudanças**: o pedido aparece em "Novos". Clica em **Enviar orçamento**, escreve um valor.
5. Abre o link de acompanhamento do cliente: o preço já deve aparecer, com **Aceitar** e **Recusar**.
6. De volta ao painel, **Confirmar mudança** com uma data.
7. Experimenta o botão **Exportar para Excel**.

## Verificado / não verificado
**Verificado** (Postgres real + Next.js real com servidor simulado + 26 novas verificações automáticas): validação completa do pedido (m³, moradas, código postal PT, data, consentimento); a base de dados recusa dados inválidos, negócios sem o módulo, e limita abusos (3 pedidos/hora por telefone); **o preço só é visível ao cliente depois de "Orçamentado"** — confirmado com Postgres real e com um pedido real submetido a um Next.js a correr, incluindo os botões de aceitar/recusar só aparecerem nesse momento; capacidade diária bloqueia dias cheios; "Concluído" é um estado final; exportação CSV com os caracteres portugueses corretos; formulário e painel em pt-PT, pt-BR, en, es; a página inicial mostra o novo nicho.

**Só se confirma no teu Supabase**: a gravação a partir do browser (enviar o formulário do cliente com clique real, os botões de ação no painel), o envio da mensagem de WhatsApp a partir do telemóvel, e o Realtime na fila de mudanças.

## Limitações a conhecer
- O **preço indicativo** (por m³) é só uma sugestão; a empresa escreve sempre o valor final à mão. É intencional, porque disseste que o valor só é dado depois de analisar tudo.
- O **e-mail** do cliente é opcional e guardado, mas ainda não é usado para enviar nada (só o WhatsApp envia mensagens).
- A **exportação para Excel** é feita pelo browser (não há agendamento de exportação automática por agora).
