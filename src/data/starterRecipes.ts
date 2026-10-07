// Starter recipes added once (logic/starter.ts): 20 high-protein dinners under 750 kcal per serve.
// Adapted from BBC Good Food (each links to its original): ingredient lists use Australian names,
// methods are written in our own words, nutrition is per serve as published with the original.
// `slug` names the photo in starter-photos/ (closed testing only: see STARTER_PHOTOS).

export interface StarterRecipe {
  slug: string;
  title: string;
  source_url: string;
  servings: number;
  prep_min: number;
  cook_min: number;
  cuisine?: string;
  nutrition: { calories: string; protein: string; fat: string; carbohydrates: string; fibre: string };
  ingredients: string[];
  method: string[];
}

const n = (kcal: number, protein: number, fat: number, carbs: number, fibre: number) => ({
  calories: `${kcal} calories`, protein: `${protein} grams protein`, fat: `${fat} grams fat`,
  carbohydrates: `${carbs} grams carbohydrates`, fibre: `${fibre} g`,
});

const BBC = "https://www.bbcgoodfood.com/recipes/";

export const STARTER_RECIPES: StarterRecipe[] = [
  {
    slug: "marry-me-chicken", title: "'Marry me' chicken", source_url: `${BBC}marry-me-chicken`,
    servings: 4, prep_min: 20, cook_min: 45, nutrition: n(584, 38, 38, 21, 6),
    ingredients: [
      "30g plain flour", "4 chicken breasts", "125g sun-dried tomatoes in oil, drained and chopped, keep 3 tbsp of the oil",
      "1 red onion, finely chopped", "3 garlic cloves, crushed", "1 tsp chilli flakes (to taste)",
      "3 thyme or oregano sprigs, leaves picked (or 1 tsp dried mixed herbs)", "150ml thickened cream",
      "250ml chicken stock", "35g parmesan, grated", "10 basil leaves, torn", "lemon wedges, to serve (optional)",
    ],
    method: [
      "Season the flour with salt and pepper on a plate and dust the chicken breasts in it.",
      "Warm 2 tbsp of the sun-dried tomato oil in a large frying pan with a lid over medium heat. Brown the chicken on both sides (8-10 mins; it doesn't need to be cooked through), then lift it out onto a plate.",
      "Add the last tablespoon of oil, turn the heat down a little and soften the onion for 8-10 mins without letting it colour. Add the garlic for a minute, then the sun-dried tomatoes, chilli and herbs.",
      "Return the chicken, pour in the cream and stock and season. Cover and simmer gently for about 20 mins, turning the chicken once, until it's cooked through and the sauce has thickened slightly.",
      "Stir the parmesan into the sauce, scatter with basil and serve with lemon wedges if you like.",
    ],
  },
  {
    slug: "chinese-chicken-curry", title: "Chinese chicken curry", source_url: `${BBC}chinese-chicken-curry`, cuisine: "Chinese",
    servings: 4, prep_min: 15, cook_min: 40, nutrition: n(264, 40, 8, 7, 2),
    ingredients: [
      "4 skinless chicken breasts, cut into chunks (or thigh fillets)", "2 tsp cornflour", "1 onion, diced",
      "2 tbsp canola oil", "1 garlic clove, crushed", "2 tsp curry powder", "1 tsp turmeric", "1/2 tsp ground ginger",
      "pinch of sugar", "400ml chicken stock", "1 tsp soy sauce", "1 cup frozen peas", "rice, to serve",
    ],
    method: [
      "Coat the chicken in the cornflour, season and set aside.",
      "In a wok, gently cook the onion in half the oil for 5-6 mins until soft. Add the garlic for a minute, then the spices and sugar for another minute.",
      "Pour in the stock and soy sauce and simmer for 20 mins, then blend the sauce until smooth.",
      "Wipe the wok, heat the rest of the oil and brown the chicken all over. Pour the sauce back in, add the peas and simmer for 5 mins, loosening with a splash of water if it's too thick. Serve with rice.",
    ],
  },
  {
    slug: "crispy-chilli-turkey-noodles", title: "Crispy chilli turkey noodles", source_url: `${BBC}crispy-chilli-turkey-noodles`,
    servings: 4, prep_min: 5, cook_min: 15, nutrition: n(566, 40, 8, 83, 2),
    ingredients: [
      "2 tbsp sesame oil", "500g turkey mince", "1 tbsp ginger, grated", "1 large garlic clove, crushed", "3 tbsp honey",
      "3 tbsp soy sauce", "1 tbsp sriracha", "350g dried udon noodles", "2 limes, juiced, plus wedges to serve",
      "2 large carrots, cut into matchsticks", "4 spring onions, shredded", "15g coriander, chopped (optional)",
    ],
    method: [
      "Heat 1 tbsp of the oil in a large non-stick frying pan over high heat. Fry the turkey mince for 10-12 mins, breaking it up, until browned and crisp.",
      "Add the ginger and garlic for a minute, then stir in the honey, soy sauce and sriracha and let it bubble for 2 mins.",
      "While the mince cooks, boil the noodles as the packet says. Drain, then toss with the remaining oil and the lime juice.",
      "Share the noodles between bowls and top with the turkey, carrot, spring onion and coriander. Serve with lime wedges.",
    ],
  },
  {
    slug: "chicken-biryani", title: "Chicken biryani", source_url: `${BBC}chicken-biryani`, cuisine: "Indian",
    servings: 4, prep_min: 10, cook_min: 30, nutrition: n(660, 49, 16, 79, 4),
    ingredients: [
      "300g basmati rice", "25g butter", "1 large onion, finely sliced", "1 bay leaf", "3 cardamom pods", "1 small cinnamon stick",
      "1 tsp turmeric", "4 skinless chicken breasts, cut into large chunks", "4 tbsp curry paste", "85g sultanas",
      "850ml chicken stock", "30g coriander", "2 tbsp toasted flaked almonds, to serve",
    ],
    method: [
      "Soak the rice in warm water for a few minutes, then rinse it in cold water until the water runs clear.",
      "Melt the butter in a large saucepan and gently cook the onion with the bay leaf, cardamom and cinnamon for 10 mins.",
      "Stir in the turmeric, chicken and curry paste and cook until it smells fragrant.",
      "Add the rice and sultanas, pour in the stock, cover tightly and bring to a rolling boil. Turn the heat right down and cook for 5 mins more.",
      "Take off the heat and leave covered for 10 mins. Stir through half the coriander (chopped), then top with the remaining leaves and the almonds.",
    ],
  },
  {
    slug: "tandoori-trout", title: "Tandoori trout", source_url: `${BBC}tandoori-trout`,
    servings: 4, prep_min: 5, cook_min: 35, nutrition: n(359, 35, 15, 27, 7),
    ingredients: [
      "4 thick trout fillets", "1 tbsp tandoori paste", "500g baby potatoes, larger ones halved", "2 tbsp vegetable oil",
      "1 garlic clove, chopped", "1 tsp ground cumin", "1 tsp garam masala", "1/2 tsp ground turmeric", "320g frozen peas",
      "natural yoghurt, coriander and mango chutney, to serve",
    ],
    method: [
      "Rub the trout with the tandoori paste. Cook the potatoes in salted boiling water for 15-20 mins until just tender, then drain and let them steam dry.",
      "Heat the grill. Grill the trout on a foil-lined tray for 6-8 mins until it flakes easily.",
      "Meanwhile, fry the garlic and spices in the oil in a large pan for a couple of minutes, add the potatoes and fry for 3 mins until crisp at the edges. Add the peas and heat through for 2-3 mins.",
      "Season and serve the potatoes with the trout, scattered with coriander, with yoghurt and chutney on the side.",
    ],
  },
  {
    slug: "slow-cooker-chicken-casserole", title: "Slow-cooker chicken casserole", source_url: `${BBC}slow-cooker-chicken-casserole`,
    servings: 2, prep_min: 10, cook_min: 435, nutrition: n(412, 38, 15, 29, 6),
    ingredients: [
      "1 tsp butter", "1/2 tbsp olive oil", "1 large onion, finely chopped", "1 1/2 tbsp plain flour",
      "650g skinless chicken thigh fillets", "3 garlic cloves, crushed", "400g baby potatoes, halved", "2 celery sticks, diced",
      "2 carrots, diced", "250g mushrooms, quartered", "15g dried porcini mushrooms, soaked in 50ml boiling water",
      "500ml salt-reduced chicken stock", "2 tsp Dijon mustard, plus extra to serve", "2 bay leaves",
    ],
    method: [
      "Soften the onion in the butter and oil in a large frying pan for 8-10 mins until it starts to colour.",
      "Toss the chicken in the flour with a little salt and pepper, then add it to the pan with the garlic and cook for 4-5 mins until lightly browned.",
      "Tip everything into the slow cooker with the potatoes, celery, carrots, both kinds of mushroom (with their soaking water), stock, mustard and bay leaves. Stir well.",
      "Cook on Low for 7 hours or High for 4 hours. Take out the bay leaves and serve with extra mustard.",
    ],
  },
  {
    slug: "one-pot-garlic-chicken", title: "One-pot garlic chicken", source_url: `${BBC}one-pot-garlic-chicken`,
    servings: 4, prep_min: 10, cook_min: 30, nutrition: n(570, 44, 36, 17, 1),
    ingredients: [
      "4 chicken breasts, sliced into thick strips", "75g plain flour", "2 tbsp olive oil", "50g unsalted butter",
      "15 garlic cloves, peeled (or to taste)", "250ml hot chicken stock", "100ml thickened cream", "30g parmesan, finely grated",
      "10g flat-leaf parsley, chopped (optional)", "rice and green beans, to serve (optional)",
    ],
    method: [
      "Toss the chicken strips in the seasoned flour. Fry in the oil over medium-high heat for 1-2 mins until lightly golden, in batches if needed.",
      "Turn the heat to medium, add the butter and the whole garlic cloves and cook for 5 mins, stirring, until the garlic is pale golden.",
      "Add the stock and simmer for 10 mins until the garlic is soft, then stir in the cream and parmesan and simmer 5 mins more until the sauce thickens.",
      "Check the seasoning, scatter with parsley and serve with rice and green beans.",
    ],
  },
  {
    slug: "chicken-karahi", title: "Chicken karahi", source_url: `${BBC}chicken-karahi`, cuisine: "Indian",
    servings: 6, prep_min: 15, cook_min: 45, nutrition: n(389, 40, 23, 4, 1),
    ingredients: [
      "2 tbsp ghee", "800g tomatoes, roughly chopped", "5 large green chillies", "8 black peppercorns",
      "1.5kg whole chicken, cut into small pieces on the bone, skin removed", "1 tbsp unsalted butter",
      "30g ginger, cut into thin strips", "20g coriander, chopped", "2 limes, cut into wedges",
      "rice, naan or roti, to serve",
    ],
    method: [
      "Heat the ghee in a karahi or heavy pan over medium heat and cook the tomatoes for 5-6 mins until they collapse.",
      "Add the whole chillies, peppercorns and 1 tsp salt and fry for 2-3 mins, then add the chicken and stir to coat.",
      "Cover and cook for 15-20 mins, then uncover and keep cooking for another 20-25 mins until the sauce is thick and sticky and the chicken is cooked through.",
      "Season, then top with the butter, ginger and coriander. Serve with lime wedges and rice, naan or roti.",
    ],
  },
  {
    slug: "one-pan-piri-piri-chicken-dinner", title: "One-pan piri piri chicken dinner", source_url: `${BBC}one-pan-piri-piri-chicken-dinner`,
    servings: 4, prep_min: 30, cook_min: 60, nutrition: n(571, 42, 30, 31, 6),
    ingredients: [
      "1kg bone-in chicken thighs and drumsticks", "500g baby potatoes, thickly sliced", "1 red capsicum, thickly sliced",
      "1 yellow capsicum, thickly sliced", "200g cherry tomatoes", "15g coriander, chopped", "corn cobs, to serve",
      "1 1/2 tsp smoked paprika", "25g brown sugar", "1 lime, zested and juiced", "1 tsp chilli flakes",
      "2 garlic cloves, chopped", "4 tbsp olive oil", "1 tbsp dried oregano", "1 red chilli, deseeded and chopped (optional)",
      "1 tbsp red wine (optional)",
    ],
    method: [
      "Make the marinade: pound or blitz the paprika, sugar, lime zest and juice, chilli flakes, garlic, oil, oregano, fresh chilli and wine with 1 tsp salt into a loose paste.",
      "Cut a few slashes in each chicken piece, coat in the marinade and refrigerate for at least 1 hour (or overnight).",
      "Heat the oven to 200C fan. Toss the chicken, marinade and potatoes in a roasting tin, sit the chicken on top (thighs skin-side up) and roast for 35-40 mins.",
      "Stir the capsicum through the potatoes, baste the chicken, add the tomatoes and roast for 20-25 mins more until the chicken is cooked and crisp. Scatter with coriander and serve with corn.",
    ],
  },
  {
    slug: "zingy-teriyaki-beef-skewers", title: "Zingy teriyaki beef skewers", source_url: `${BBC}zingy-teriyaki-beef-skewers`,
    servings: 2, prep_min: 20, cook_min: 25, nutrition: n(563, 39, 22, 46, 9),
    ingredients: [
      "1 tbsp soy sauce", "3 tbsp orange juice", "15g ginger, finely grated", "2 garlic cloves, crushed", "1 tsp honey",
      "1/4 tsp chilli flakes", "300g sirloin steak, trimmed and cut into long thin strips", "100g brown rice",
      "1/3 cucumber, diced", "2 carrots, peeled into ribbons", "4 spring onions, sliced", "100g radishes, sliced",
      "20g coriander, chopped", "10g mint leaves", "1 tbsp canola oil", "1 lime, zested and juiced", "25g cashews, toasted and chopped",
    ],
    method: [
      "Boil the soy sauce, orange juice, ginger, garlic, honey and chilli flakes with 100ml water for 3-5 mins until syrupy. Pour into a dish and let it cool.",
      "Thread the beef onto 4 skewers (soak wooden ones first), turn them in the glaze and leave for 30 mins.",
      "Cook the rice as the packet says, rinse under cold water and drain. Toss with the cucumber, carrot, spring onion, radish, herbs, oil, lime zest and juice, and season with pepper.",
      "Grill the skewers on high for 3-5 mins a side, brushing with the leftover glaze when you turn them. Serve with the rice salad, topped with the cashews.",
    ],
  },
  {
    slug: "one-pan-beef-stew-with-vegetable-mash", title: "One-pan beef stew with vegetable mash", source_url: `${BBC}one-pan-beef-stew-with-vegetable-mash`,
    servings: 4, prep_min: 30, cook_min: 135, nutrition: n(522, 39, 15, 52, 11),
    ingredients: [
      "2 tbsp canola oil", "600g lean diced beef", "320g Swiss brown mushrooms, quartered", "2 bay leaves", "2 tbsp thyme leaves",
      "4 small red onions, quartered", "4 garlic cloves, thinly sliced", "320g carrots, cut into chunks", "600ml vegetable stock",
      "4 tbsp tomato paste", "700g swede, peeled and cut into chunks", "850g potatoes, peeled and cut into chunks",
      "broccoli or peas, to serve",
    ],
    method: [
      "Brown the beef in the oil in batches in a large non-stick pan, then set aside.",
      "Cook the mushrooms, bay and thyme in the same pan for 5 mins, then add the onions and garlic until they soften.",
      "Put the beef back with the carrots, stock and tomato paste. Cover and simmer for 2 hours until the beef is tender and the sauce is thick.",
      "For the mash, boil the swede for 5 mins, add the potatoes and boil 15-20 mins more until soft. Drain and mash with plenty of pepper. Serve with the stew and greens. Leftovers keep in the fridge for a few days.",
    ],
  },
  {
    slug: "steak-roasted-pepper-pearl-barley-salad", title: "Steak, roasted capsicum & pearl barley salad", source_url: `${BBC}steak-roasted-pepper-pearl-barley-salad`, cuisine: "Mediterranean",
    servings: 2, prep_min: 10, cook_min: 30, nutrition: n(498, 38, 17, 48, 6),
    ingredients: [
      "85g pearl barley, rinsed", "1 red capsicum, cut into strips", "1 yellow capsicum, cut into strips",
      "1 red onion, cut into 8 wedges", "1 tbsp olive oil, plus a little extra", "300g lean steak, trimmed",
      "50g watercress or rocket, chopped", "1/2 lemon, juiced, plus wedges to serve (optional)",
    ],
    method: [
      "Boil the barley in plenty of water for 25-30 mins until tender, then drain well.",
      "Meanwhile, roast the capsicum and onion tossed in 1 tbsp oil at 180C fan for about 20 mins.",
      "Rub the steak with a little oil, season and pan-fry for 3-4 mins each side (or to your liking). Rest it for a few minutes.",
      "Mix the roasted veg, watercress, lemon juice and seasoning through the barley. Slice the steak thinly over the top and serve with lemon wedges.",
    ],
  },
  {
    slug: "quick-cottage-pie", title: "Quick cottage pie", source_url: `${BBC}quick-cottage-pie`, cuisine: "British",
    servings: 4, prep_min: 10, cook_min: 30, nutrition: n(390, 36, 11, 40, 3),
    ingredients: [
      "100g mushrooms, halved", "1 tbsp olive oil", "1 tbsp plain flour", "500g lean beef mince", "1 onion, finely chopped",
      "1 carrot, finely diced", "2 tbsp tomato paste", "250ml beef stock", "750g potatoes, quartered",
      "75ml buttermilk or skim milk", "2 spring onions, thinly sliced",
    ],
    method: [
      "Heat the oven to 200C fan. Brown the mushrooms in the oil for 5 mins, then add the mince, onion and carrot and cook until the mince is browned.",
      "Stir in the flour and tomato paste, add the stock and simmer for 10 mins until thickened. Spoon into a medium baking dish.",
      "Meanwhile, boil the potatoes for 15 mins until soft, drain and mash with the buttermilk and half the spring onion.",
      "Spread the mash over the mince, rough up the top and bake for 15 mins until golden. Scatter with the rest of the spring onion.",
    ],
  },
  {
    slug: "beef-schnitzel", title: "Beef schnitzel", source_url: `${BBC}beef-schnitzel`, cuisine: "German",
    servings: 5, prep_min: 20, cook_min: 20, nutrition: n(468, 43, 14, 46, 2),
    ingredients: [
      "5 thin beef steaks (minute steaks)", "50g plain flour", "2 tsp paprika", "2 eggs, lightly beaten", "250g dried breadcrumbs",
      "5 tsp butter", "5 tsp olive oil", "lemon wedges, to serve",
    ],
    method: [
      "Sandwich the steaks between sheets of baking paper or cling wrap and flatten them with a rolling pin until very thin.",
      "Set up three plates: flour mixed with the paprika, salt and pepper; the beaten egg; and the breadcrumbs. Coat each steak in flour, then egg, then crumbs.",
      "Fry one schnitzel at a time in 1 tsp each of butter and oil for about a minute a side until golden and crisp.",
      "Serve with lemon wedges, and salad or coleslaw if you like.",
    ],
  },
  {
    slug: "jerk-chicken-burger", title: "Jerk chicken burger", source_url: `${BBC}jerk-chicken-burger`, cuisine: "Caribbean",
    servings: 2, prep_min: 10, cook_min: 10, nutrition: n(417, 38, 9, 45, 4),
    ingredients: [
      "2 skinless chicken breasts", "1 tsp thyme leaves", "1 tbsp olive oil", "2 tsp jerk seasoning",
      "1 lime, juiced", "2 large bread rolls", "1/2 small mango, peeled and sliced", "1 tomato, sliced",
      "1 baby cos lettuce, shredded", "mayonnaise and tomato sauce, to serve (optional)",
    ],
    method: [
      "Flatten the chicken between sheets of baking paper with a rolling pin.",
      "Mix the thyme, oil, jerk seasoning and half the lime juice, coat the chicken and leave for 5 mins.",
      "Cook on a hot griddle or frying pan for 4-5 mins a side until cooked through. Toast the cut sides of the rolls.",
      "Fill the rolls with the chicken, mango, tomato and lettuce, squeeze over the rest of the lime and add mayo and sauce if you like.",
    ],
  },
  {
    slug: "pomegranate-chicken-almond-couscous", title: "Pomegranate chicken with almond couscous", source_url: `${BBC}pomegranate-chicken-almond-couscous`, cuisine: "Middle Eastern",
    servings: 4, prep_min: 5, cook_min: 15, nutrition: n(590, 50, 20, 50, 4),
    ingredients: [
      "1 tbsp vegetable oil", "200g couscous", "1 chicken stock cube", "1 large red onion, thinly sliced",
      "600g chicken tenderloins", "2 tbsp harissa paste", "190ml unsweetened pomegranate juice", "100g pomegranate seeds",
      "100g toasted flaked almonds", "10g mint, chopped",
    ],
    method: [
      "Put the couscous in a bowl with some seasoning and half the stock cube crumbled in. Cover with just-boiled water, cover the bowl and leave it.",
      "Soften the onion in the oil in a large frying pan for a few minutes, then push it aside and brown the chicken.",
      "Stir in the harissa and pomegranate juice, crumble in the rest of the stock cube, season and simmer uncovered for 10 mins until the chicken is cooked and the sauce thickens. Stir through most of the pomegranate seeds.",
      "Fluff the couscous with a fork and mix in the almonds and mint. Serve the chicken and sauce on top with the last of the seeds.",
    ],
  },
  {
    slug: "healthy-chicken-burritos", title: "Healthy chicken burritos", source_url: `${BBC}healthy-chicken-burritos`,
    servings: 4, prep_min: 10, cook_min: 25, nutrition: n(529, 36, 20, 46, 13),
    ingredients: [
      "2 tsp canola oil", "1 large red capsicum, cut into thick strips", "1 tsp cumin seeds", "2 tsp mild chilli powder",
      "400g can black beans", "200g can corn kernels, drained", "1 tbsp tomato paste", "1 large garlic clove, grated",
      "250g cooked brown rice", "300g cooked chicken, shredded", "15g coriander, chopped", "2 small avocados, sliced",
      "1 lime, juiced", "4 large wholemeal tortillas",
    ],
    method: [
      "Cook the capsicum in the oil in a large covered frying pan over low heat for 10 mins until soft and a little charred.",
      "In another dry pan, toast the cumin and chilli for 2-3 mins, then add the beans with their liquid, the corn, tomato paste and garlic. Let it bubble, then stir in the rice, chicken and coriander and heat through for 3-4 mins.",
      "Toss the avocado in the lime juice. Spoon the filling down the middle of each tortilla, add capsicum and avocado, fold in the ends and roll up tightly.",
      "Toast the burritos seam-side down in the capsicum pan for 2-3 mins a side over low heat.",
    ],
  },
  {
    slug: "simple-fish-stew", title: "Quick and easy fish stew", source_url: `${BBC}simple-fish-stew`, cuisine: "Spanish",
    servings: 2, prep_min: 10, cook_min: 25, nutrition: n(346, 42, 8, 20, 11),
    ingredients: [
      "1 tbsp olive oil", "1 tsp fennel seeds", "2 carrots, diced", "2 celery sticks, diced", "2 garlic cloves, finely chopped",
      "2 leeks, thinly sliced", "400g can diced tomatoes", "500ml hot fish stock", "200g white fish fillets, cut into chunks",
      "85g raw peeled prawns",
    ],
    method: [
      "Gently cook the fennel seeds, carrot, celery and garlic in the oil in a large pan for 5 mins.",
      "Add the leeks, tomatoes and stock, season, bring to the boil, then cover and simmer for 15-20 mins until the veg is tender and the sauce has reduced a little.",
      "Add the fish and prawns and simmer for 2-3 mins until just cooked. Serve in bowls.",
    ],
  },
  {
    slug: "puy-lentils-with-seared-salmon", title: "Puy lentils with seared salmon", source_url: `${BBC}puy-lentils-with-seared-salmon`,
    servings: 2, prep_min: 15, cook_min: 40, nutrition: n(519, 38, 25, 29, 12),
    ingredients: [
      "160g dried French-style green lentils", "2 bay leaves", "2 tbsp canola oil, plus a little extra", "2 onions, finely chopped",
      "180g celery, thinly sliced", "320g carrots, finely diced", "2 tbsp thyme leaves", "1 tbsp wholegrain mustard, plus 1 tsp",
      "2 tbsp apple cider vinegar", "10g flat-leaf parsley, chopped", "2 skin-on salmon fillets (about 260g)", "balsamic vinegar, to drizzle",
    ],
    method: [
      "Boil the lentils with the bay leaves for 10 mins, then simmer for about 20 mins more until tender. Drain.",
      "Meanwhile, fry the onions in the oil over high heat until soft, then add the celery, carrots and thyme. Cover, lower the heat and cook for 10 mins until tender.",
      "Stir the lentils, 1 tbsp mustard and the cider vinegar into the veg, then the parsley. (Half the lentils make a good lunch for later in the week.)",
      "Spread 1 tsp mustard over the salmon and cook skin-side down in a lightly oiled pan for 6 mins, then 4 mins on the other side. Serve on the lentils with a drizzle of balsamic.",
    ],
  },
  {
    slug: "one-pot-chicken-rice", title: "One-pot chicken & rice", source_url: `${BBC}one-pot-chicken-rice`,
    servings: 4, prep_min: 10, cook_min: 40, nutrition: n(519, 38, 15, 55, 9),
    ingredients: [
      "1 tbsp smoked paprika", "1 tbsp ground coriander", "2 garlic cloves, grated", "2 tsp canola oil",
      "600g skinless chicken thigh fillets, halved", "700ml hot vegetable stock", "250g brown rice", "320g leeks, sliced",
      "1 tsp dried oregano", "2 bay leaves (optional)", "320g frozen mixed vegetables",
    ],
    method: [
      "Mix the paprika, coriander, garlic and oil in a bowl and coat the chicken in it.",
      "Brown the chicken in a large non-stick pan with a lid for 5 mins, turning once, then lift it out.",
      "Pour the stock into the pan, scraping up the bits on the bottom, and stir in the rice, leeks, oregano and bay. Put the chicken on top, cover, bring to the boil and simmer for 20 mins.",
      "Stir in the frozen veg, cover and cook 5 mins more. Rest for 5-10 mins, then stir gently and serve.",
    ],
  },
];
