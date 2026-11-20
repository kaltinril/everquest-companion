// tradeskills/RecipeWish.tsx — a crafted item on the wish list, from the Tradeskills section
// (owner, 2026-11-20: "perhaps people can 'wishlist' a crafted item in some way so they can work
// towards it").
//
// The control is the app's one wish control (`wishlist/WishToggle.tsx`), the same words and the
// same toggle as on the Gear table and the Loot item page; this file only says which item. The
// wish is the plain item wish those two write (`wishSearch.wishFromGear`, keyed by the item's
// key), so the Wish list tab reads it as it reads theirs, and one item is one wish whichever tab
// added it. Home's "Working towards" panel (HomeWished.tsx) lists the wished items a recipe makes.
//
// Nothing is drawn until the wish list has loaded: before that "not wished" would be a default,
// and the control would offer the wrong action (the Loot item page's rule).

import type { JSX } from 'react'
import { hasWish } from '@shared/planner/wishlist'
import type { BookRecipe } from '@shared/tradeskillBook'
import WishToggle from '../wishlist/WishToggle'
import { useWishlist } from '../wishlist/useWishlist'
import { wishFromGear } from '../wishlist/wishSearch'

/** Adds the recipe's item to the wish list, or takes it off. `testId` names the surface it sits on. */
export function RecipeWish({ recipe, testId }: { recipe: Pick<BookRecipe, 'key' | 'item'>; testId: string }): JSX.Element | null {
  const wishlist = useWishlist()
  if (!wishlist.ready) return null
  const wished = hasWish(wishlist.list, recipe.key)
  return (
    <WishToggle
      name={recipe.item}
      wished={wished}
      testId={testId}
      onToggle={() => {
        if (wished) wishlist.remove(recipe.key)
        else wishlist.add(wishFromGear({ key: recipe.key, name: recipe.item }, Date.now()))
      }}
    />
  )
}
