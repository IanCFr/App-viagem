# Design: "Fim de tarde lilás"

A identidade visual nasce do pôr do sol na orla de João Pessoa: céu lilás, horizonte pêssego e um rosa quente. O app é feito para ser usado na rua, sob sol forte, num iPhone.

## Paleta

| Token | Cor | Uso |
|---|---|---|
| `--cream` | `#FFF8F2` | Fundo |
| `--plum` | `#3B2B4F` | Texto principal (12,1:1 sobre o fundo) |
| `--rose` | `#D6537F` | Marca: botão "+", curva do gráfico, ícones e barras |
| `--rose-ink` | `#B94B76` | Botões e links com texto (4,6:1). O `#D6537F` tem só 3,7:1 e não serve para texto pequeno |
| `--lilac` | `#BBA8DD` | Céu, linha do ritmo ideal e fundos claros; nunca como cor de texto |
| `--peach` | `#FFCFA8` | Ticket alimentação, sol e areia |
| `--muted` | `#6F5E8A` | Texto secundário (5,4:1 sobre branco) |
| `--wine` | `#A8323E` | Só para orçamento ultrapassado e exclusão, para não se confundir com o rosa da marca |

As categorias têm ícone em círculo com fundo claro e cor de ícone próprios, com contraste acima de 4:1: Eventos/Passeios em rosa, Translado em lilás, Alimentação em pêssego e Diversos em ameixa.

## Tipografia

A fonte é a **SF Pro Rounded** nativa do iPhone (`ui-rounded`), sem baixar arquivos, então funciona offline. Em outros sistemas cai na fonte do sistema. Os números usam dígitos de largura fixa (`tabular-nums`). Títulos ficam em peso 700 com espaçamento justo; os textos auxiliares são em frase normal, sem caixa alta decorativa.

## Componentes

### Céu de fim de tarde

O cartão "Ainda temos" é um céu em degradê com o sol que **desce conforme o orçamento é usado**: alto no começo, encostado no horizonte aos 100% e escondido no mar quando o orçamento é ultrapassado (`Dusk` em `src/App.tsx`). "Já gastamos" e o orçamento ficam numa faixa branca abaixo, para não cobrir o horizonte.

### Ritmo da viagem

Gráfico em SVG (`src/TripPace.tsx`) com:

- a curva suave do gasto acumulado no orçamento, sem o ticket, que para no dia de hoje;
- a linha tracejada do ritmo ideal, que segue até o último dia;
- uma área em degradê rosa sob a curva.

A curva usa interpolação monotônica, para nunca "descer" entre dois dias. Tocar num dia mostra o gasto do dia, a parte no ticket, o acumulado e o ritmo ideal.

### Tela de entrada

Ilustração em SVG (`src/LoginArt.tsx`) do casal de mãos dadas na areia, vendo o sol se pôr, com coqueiros e reflexos no mar. Ela é ancorada embaixo e no centro: em telas estreitas os coqueiros são cortados, o casal e o sol nunca.

### Navegação e formulários

- Barra inferior flutuante com Visão geral, o botão "+" e Gastos; Configurações ficam na engrenagem do topo. No computador, barra lateral.
- O formulário de gasto abre como uma "folha" que sobe da parte de baixo da tela.
- Categorias, registros e configurações aparecem em listas agrupadas no estilo iPhone.
- Arredondamento com hierarquia: 28 px no céu e nas folhas, 20 px nos grupos, 14 px nos campos, pílula nos botões e selos.
- Sombra só no que flutua (barra inferior, céu, folha). O resto usa borda fina em tom ameixa.

### Ocultar valores

O olho no topo troca todo valor em reais por `R$ ••••••`, sempre do mesmo tamanho, para não revelar quantos dígitos o valor tem. Descrições, datas, o sol e o formato da curva continuam visíveis. Os campos de orçamento em Configurações ficam mascarados, mas editáveis.

## Acessibilidade

- Contraste mínimo de 4,5:1 em todo texto. As cores decorativas nunca carregam texto.
- Foco visível em todos os controles.
- Ilustração com descrição. Valores ocultos são lidos como "Valor oculto". Os dias do gráfico são botões com data e valor no nome.
- `prefers-reduced-motion` desliga as animações (o sol descendo e a folha subindo).
- Campos de 50 px de altura e fonte de 16 px, para o iPhone não dar zoom ao focar.
