import { http, HttpResponse } from 'msw';

export const handlers = [

  // Mock Stripe API
  http.post('https://api.stripe.com/v1/charges', () => {
    return HttpResponse.json({
      id: 'ch_mocked_stripe_charge',
      object: 'charge',
      amount: 5000,
      captured: true,
      paid: true,
      status: 'succeeded'
    });
  }),

  // Mock Tally ERP API (which usually runs on localhost:9000 or a specific endpoint)
  http.post('http://localhost:9000', () => {
    return HttpResponse.xml(`
      <RESPONSE>
        <CREATED>1</CREATED>
        <ALTERED>0</ALTERED>
        <DELETED>0</DELETED>
        <ERRORS>0</ERRORS>
      </RESPONSE>
    `);
  })
];
