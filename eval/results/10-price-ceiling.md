# What happens when a government caps rent

A price ceiling on rent (rent control, in its strict form) makes it illegal to charge more than a set amount for a given apartment. The intention is clear: keep housing affordable for the people who live there. The effects are more tangled, because a price does two jobs at once. It decides who gets the scarce thing, and it signals whether more of that thing should be made. A ceiling below the market price changes both.

## The immediate effect: a shortage

At the market rent, the number of apartments people want to rent equals the number landlords want to offer. Set the legal maximum below that level and two things happen together. More people want apartments at the lower price, because some who would have shared or stayed with family now move out on their own. And no new apartments appear, since the stock is fixed in the short run. The gap between those two quantities is a shortage. It does not show up as a price, because the price cannot move. It shows up as queues, waiting lists and empty search results.

Sitting tenants are the clear winners in the short run. If you already have a controlled apartment, your rent is lower and your tenancy is secure. That gain is real, and it is why rent control is popular with the people it covers.

## The slow effects: feedback over years

```causal-loop id=rent title="How a rent ceiling plays out over time"
gap -> shortage : +
shortage -> search_costs : +
shortage -> mobility : -
gap -> landlord_returns : -
landlord_returns -> maintenance : +
maintenance -> quality : +
landlord_returns -> new_supply : +
new_supply -> shortage : -
landlord_returns -> conversions : -
conversions -> shortage : +
shortage -> political_support : +
political_support -> gap : +
loop "Supply erosion": gap -> landlord_returns -> new_supply -> shortage -> political_support -> gap
loop "Conversions": gap -> landlord_returns -> conversions -> shortage -> political_support -> gap

steps:
  gap -> shortage "The cap sits below the market rent. The size of that gap sets the size of the shortage."
  shortage -> search_costs "With price unable to ration, something else does: waiting, connections, key money, discrimination."
  landlord_returns -> maintenance "Lower returns mean less spent on upkeep, so the controlled stock slowly deteriorates."
  landlord_returns -> new_supply "Builders put new capital elsewhere, so the shortage does not close."
  shortage -> political_support "A worse shortage makes the cap more valuable to those who have a unit, and harder to remove."
```

The [gap](#rent.gap) between the legal rent and the market rent drives everything. Over the years, three slower responses follow.

**Rationing by something other than price.** When price cannot clear the market, other rules do. Tenants pay in time (long searches), in side payments (illegal "key money" or overpriced furniture sold with the lease) and in luck. Landlords with many applicants can pick on criteria that have nothing to do with ability to pay. Tenants also stop moving: giving up a cheap controlled flat is costly, so people stay in units that no longer fit their job or family, and [mobility](#rent.mobility) falls.

**Lower quality.** A landlord whose rent is capped can still cut costs. The cheapest cost to cut is [maintenance](#rent.maintenance). Over a decade the controlled stock ages faster than the rest of the market.

**Less new housing.** Investors compare the return on building rental housing with other uses of their money. A cap lowers that return, so less is built and existing units get [converted](#rent.conversions) to condos, owner-occupation or short-term rentals that escape the cap. Both make the shortage worse in the long run, which is exactly the opposite of the intent.

The [political loop](#rent.political_support) explains why ceilings persist even so. The worse the shortage, the more a controlled tenancy is worth to the people who have one, and the more they will fight to keep the cap.

## Designs that soften the trade-off

Economists broadly agree that a hard ceiling below the market rate shrinks supply over time. Most real policies are softer.

```tradeoffs id=options title="Ways to help renters"
ceiling: "Hard ceiling"
stabilisation: "Rent stabilisation"
vouchers: "Housing vouchers"
build: "Build more" {role=focus}

ceiling.help_now : "large, for sitting tenants" {role=happy}
ceiling.supply : shrinks {role=error}
ceiling.cost : "hidden, borne by landlords and future renters"
ceiling.targeting : "by luck, not need" {role=error}

stabilisation.help_now : "caps yearly increases" {role=happy}
stabilisation.supply : "mild effect, new builds exempt"
stabilisation.cost : "hidden, smaller"
stabilisation.targeting : "existing tenants"

vouchers.help_now : "for recipients" {role=happy}
vouchers.supply : "neutral to positive"
vouchers.cost : "on the budget" {role=error}
vouchers.targeting : "by income" {role=happy}

build.help_now : "slow, years" {role=error}
build.supply : grows {role=happy}
build.cost : "zoning reform is cheap; public building is not"
build.targeting : "everyone, via lower market rents" {role=happy}
```

[Rent stabilisation](#options.stabilisation) limits annual increases rather than freezing the level, and usually exempts new construction so building still pays. [Vouchers](#options.vouchers) help low-income renters pay market rent, keeping the price signal intact but putting the cost on the public budget, where it is visible. [Building more](#options.build), especially by loosening zoning, attacks the cause of high rents, at the price of taking years to work.

The underlying lesson is that a ceiling does not make housing cheaper to provide. It changes who pays and how: lower rent for those inside, paid for by those still looking and by the housing that never gets built.
