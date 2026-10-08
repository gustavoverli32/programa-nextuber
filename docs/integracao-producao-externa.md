# Integração Planner e Tuber

O Nextuber está preparado para receber, de forma privada, a produção diária enviada pela **Planner e Tuber**. O vínculo é sempre feito pelo **funcional de nove dígitos** do estagiário. O nome é recebido apenas para conferência e não é usado para localizar o cadastro.

O Nextuber recebe e armazena os resultados diariamente, mas **não atualiza a tabela semanal todos os dias**. No fechamento de sexta-feira, às 23h50 no horário de São Paulo, ele soma os lançamentos de segunda a sexta e grava uma única vez os totais nas células semanais existentes. A digitação manual continua ativa somente como plano B para exceções.

## Endereço de recebimento

`POST https://www.nextuber.com.br/api/integrations/production`

O endereço só aceita requisições autenticadas pelo servidor da Planner e Tuber. Ele nunca deve ser chamado pelo navegador.

## Chave de integração

O Nextuber usa uma chave privada chamada `NEXTUBER_PRODUCTION_IMPORT_API_KEY`, guardada exclusivamente no ambiente seguro do Vercel. A chave é enviada uma única vez ao responsável técnico da Planner e Tuber por canal seguro e não deve ser cadastrada no navegador, em planilhas ou no banco de dados.

Envie a chave em um dos cabeçalhos abaixo:

```http
Authorization: Bearer <chave-da-integracao>
```

ou:

```http
x-api-key: <chave-da-integracao>
```

## Formato esperado

Cada lote possui um identificador único (`eventId`). Caso o mesmo lote seja reenviado, os mesmos dados são atualizados, sem duplicar produção.

```json
{
  "eventId": "planner-2026-10-07-fechamento",
  "source": "Planner e Tuber",
  "sentAt": "2026-10-07T21:00:00-03:00",
  "records": [
    {
      "funcional": "987368382",
      "nome": "Gustavo",
      "referenceDate": "2026-10-07",
      "products": [
        { "product": "Crédito consignado INSS", "amount": 10000 },
        { "product": "Seguro", "amount": 1000 },
        { "product": "Engajamento", "amount": 6 }
      ]
    }
  ]
}
```

`referenceDate` é recomendada. Quando ausente, será usada a data de `sentAt`. Os números devem ser enviados como números, sem `R$` e sem separador de milhar.

Para reenviar ou corrigir o mesmo fechamento diário, a Planner e Tuber deve manter o mesmo `eventId`. Um novo `eventId` representa um novo recebimento diário.

## Produtos reconhecidos

O Nextuber identifica os produtos já existentes na plataforma: INSS, OP, EP, Creditário, Seguros, PIC, Combinaqui, Engajamento e Consórcio. Variações como “Crédito consignado INSS” e “Seguro” são automaticamente associadas a INSS e Seguros.

## Regras de segurança

- A chave é privada, com comparação segura e sem exposição ao navegador.
- Lotes com funcional inexistente ou estagiário arquivado são rejeitados por inteiro.
- Produtos fora do catálogo do Nextuber são rejeitados; nada é gravado parcialmente.
- Os dados diários são armazenados em tabela própria, sem acesso direto pelo navegador.
- No fechamento semanal, somente os produtos efetivamente recebidos da Planner e Tuber substituem a célula correspondente; lançamentos manuais de produtos sem retorno automático são preservados.
- A chave pode ser trocada imediatamente se necessário.

## Respostas

- `200`: lote recebido e armazenado.
- `401`: chave ausente ou inválida.
- `422`: funcional não encontrado entre estagiários ativos; nenhum dado do lote é armazenado.
- `503`: integração ainda não foi ativada no ambiente seguro.
