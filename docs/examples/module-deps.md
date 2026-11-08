# Who imports whom

Checkout should talk to billing. Fulfillment should not. The grid makes that
rule visible: a mark means the **row uses the column**.

The types those modules publish — what a neighbour actually imports — are in
[What checkout and billing publish](checkout-types.md). This figure is who may
talk; that one is how.

```dependency id=shop title="Who imports whom"
checkout -> catalog
checkout -> billing
billing -> payments
fulfillment -> catalog
fulfillment -> billing {role=error}

group "storefront" {
  checkout
  catalog
}
group "back office" {
  billing
  payments
  fulfillment
}

steps:
  checkout -> billing     "Checkout is allowed to charge."
  fulfillment -> billing  "Fulfillment reaches into billing; it should go through checkout."
```

Read the **fulfillment** row. It may use catalog. The mark on billing is the
leak. Layered code would keep every mark to the right of the diagonal, and
would have no square of modules that all import each other.
