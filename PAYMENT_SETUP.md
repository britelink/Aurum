# EFT PAY Payment Gateway Setup

This document outlines the setup for the EFT PAY payment gateway integration for WILTCHIK PVT LTD.

## Configuration

The payment system is configured with the following EFT PAY credentials:

### Test Environment

- **API URL**: `https://eu-test.oppwa.com`
- **Authorization Bearer**: `OGFjN2E0Yzc5ODU4MzE3MzAxOTg1YjdjZGE0MzA0NzZ8a3I/NSNiamhmcktGS3FEaUF6bTk=`

### Payment Methods Available

1. **Zimswitch (USD)**

   - Entity ID: `8ac7a4c79858317301985b7e52f8047f`
   - Payment Brand: `PRIVATE_LABEL`
   - Test Mode: `EXTERNAL`

2. **Zimswitch (ZWG)**

   - Entity ID: `8ac7a4c79858317301985b7ee21f0483`
   - Payment Brand: `PRIVATE_LABEL`
   - Test Mode: `EXTERNAL`

3. **VISA/MASTERCARD (USD)**
   - Entity ID: `8ac7a4c79858317301985b7dcc27047a`
   - Payment Brand: `VISA MASTER`
   - Test Mode: `INTERNAL`

## Environment Variables

Add the following to your `.env.local` file:

```env
# Payment Gateway Configuration
PAYMENT_AUTH_BEARER=OGFjN2E0Yzc5ODU4MzE3MzAxOTg1YjdjZGE0MzA0NzZ8a3I/NSNiamhmcktGS3FEaUF6bTk=
PAYMENT_API_URL=https://eu-test.oppwa.com

# Entity IDs
ZIMSWITCH_USD_ENTITY_ID=8ac7a4c79858317301985b7e52f8047f
ZIMSWITCH_ZWG_ENTITY_ID=8ac7a4c79858317301985b7ee21f0483
CARD_USD_ENTITY_ID=8ac7a4c79858317301985b7dcc27047a
```

## How It Works

1. **User initiates deposit**: User clicks "Deposit" button and enters amount
2. **Payment session creation**: Backend creates a checkout session with EFT PAY
3. **Payment form display**: COPY&PAY widget is loaded for payment input
4. **Payment processing**: User completes payment through the widget
5. **Status verification**: Backend verifies payment status with EFT PAY
6. **Balance update**: User's balance is updated in the database
7. **Success/failure redirect**: User is redirected to appropriate page

## Testing

To test the payment system:

1. Use the test credentials provided above
2. Test with small amounts (e.g., $1.00)
3. Use test card numbers provided by EFT PAY
4. Verify balance updates after successful payments

## Production Setup

When ready for production:

1. Contact EFT PAY to get live gateway credentials
2. Update environment variables with live credentials
3. Change API URL to production endpoint
4. Test thoroughly with small amounts first

## Security Notes

- Never commit real credentials to version control
- Use environment variables for all sensitive data
- EFT PAY is PCI-DSS compliant
- All payment data is processed securely through their servers

## Support

For technical support with EFT PAY integration, refer to:

- [EFT PAY Developer Portal](https://developer.oppwa.com)
- [COPY&PAY Integration Guide](https://developer.oppwa.com/integration-guide)
