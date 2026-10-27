# Why growth slows down on its own

A product that spreads by word of mouth grows faster the bigger it gets, at first. Then it
slows down, even though nothing about the product changed. Two feedback loops explain both
halves of that story, and the point where one overtakes the other.

```causal-loop id=growth title="Word of mouth"
customers: "Customers"
referrals: "Referrals"
saturation: "Market saturation"
price: "Price"

customers -> referrals : + {role=happy}
referrals -> customers : + {role=happy}
customers -> saturation : +
saturation -> referrals : - {role=error}
price -> customers : - {delay=yes}

loop "Word of mouth": customers -> referrals -> customers
loop "Saturation": customers -> saturation -> referrals -> customers

steps:
  customers -> referrals    "More customers means more people telling their friends."
  referrals -> customers    "Those friends become customers, and the loop goes round again."
  customers -> saturation   "But every new customer is one fewer person left to convince."
  saturation -> referrals   "A saturated market turns fewer referrals into sign-ups."
```

[Word of mouth](#growth.referrals) is a reinforcing loop: every link is `+`, so growth feeds
on itself. Saturation closes a balancing loop through [market saturation](#growth.saturation):
it has one `-` link, so it pushes back harder the bigger the customer base gets.

Early on, saturation is tiny and the reinforcing loop wins. Later the balancing loop catches
up, and growth flattens into an S-curve. A price change acts on customers only after a delay,
which is why its effect is easy to misread.
