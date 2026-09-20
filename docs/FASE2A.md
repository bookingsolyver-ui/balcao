# Fase 2A — gerir produtos e cardápio pelo painel

## O que há de novo
- No painel, os módulos **Cardápio digital** e **Catálogo** têm o botão **Gerir** → `/[locale]/app/menu` e `/[locale]/app/catalog`.
- **Categorias**: criar, renomear, eliminar (os itens ficam "sem categoria").
- **Itens/produtos**: nome, categoria, preço, preço promocional, stock (só catálogo), descrição, ícone, **foto** e "disponível para clientes".
- Ligar/desligar a disponibilidade e ajustar o stock com **+ / −**, sem abrir o formulário.
- Preços digitados na moeda do negócio ("8500,00" ou "8500.00") e guardados em unidades mínimas com as casas decimais do negócio.
- A foto é reduzida no browser (máx. 900 px, JPEG) e enviada para o bucket `item-images` em `{tenant_id}/{uuid}.jpg`. Se o guardar falhar, a foto enviada é removida.
- A loja pública passa a mostrar a foto quando existe.
- Só **proprietário e administradores** alteram; a equipa (`staff`) vê a lista sem botões de edição (a base de dados também o impede).

## Testar
```bash
unzip -o ~/Downloads/balcao-fase2a.zip -d .
npm install && npm test
npm run dev   # http://localhost:3000
```
1. Painel → **Catálogo → Gerir**. Os produtos que criaste por SQL aparecem aqui.
2. **+ Novo produto**: preenche, escolhe uma foto e guarda.
3. Altera o stock com **+ / −**, desliga "Disponível" e abre **Abrir loja** noutro separador: as mudanças aparecem ao atualizar.
4. Cria uma categoria, move um produto para ela, elimina a categoria e vê o produto em "Sem categoria".

## Verificado / não verificado
Verificado com testes (Postgres real + renderização do ecrã): validação de preço/promoção/stock em várias moedas, aceitação dos dados pela base de dados, regras por papel (proprietário, staff, outro negócio, público), categoria apagada, e o ecrã em 4 idiomas.

**Só se confirma no teu Supabase** (o meu ambiente não chega lá):
- O **envio de fotos** para o Storage (as políticas do bucket estão na migração `…0002`, mas nunca correram fora do Supabase real).
- As chamadas de gravação pelo PostgREST a partir do browser.
Se o envio da foto falhar, aparece "Não foi possível enviar a foto". Nesse caso, abre a consola do browser (Cmd+Option+J) e copia a mensagem vermelha.

## Próxima etapa (2B)
Carrinho na loja pública, `place_order`, fila de pedidos em tempo real e mensagem de WhatsApp.
