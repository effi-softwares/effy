package com.effyshopping.customer.mobile.features.catalog

/**
 * A copy of `packages/shared-types/src/promotion-skins.fixtures.json`, embedded because `commonTest` cannot read a file outside the app. Do not edit by hand:
 * `packages/shared-types/src/promotion-skins.test.ts` reads this file and fails if it differs. Change the source first, then copy it here.
 */
internal const val PROMO_SKIN_FIXTURE = """
{
  "_comment": "095 — shared by packages/shared-types (TypeScript, the source) and customer-mobile (Kotlin: PromoSkinRules). Regenerate from promotion-skins.ts, then copy into PromoSkinFixture.kt; promotion-skins.test.ts fails when either is stale.",
  "constants": {
    "textPx": {
      "xs": 12,
      "sm": 14,
      "md": 16,
      "lg": 20,
      "xl": 24,
      "2xl": 32
    },
    "spacingPx": {
      "compact": 16,
      "regular": 24,
      "roomy": 32
    },
    "radiusPx": {
      "none": 0,
      "sm": 4,
      "md": 6,
      "lg": 8,
      "xl": 10
    },
    "weight": {
      "regular": 400,
      "medium": 500,
      "semibold": 600,
      "bold": 700
    }
  },
  "geometry": [
    {
      "layout": "panel",
      "size": "large",
      "expect": {
        "minHeight": 320,
        "pictureRatio": 1.7777777777777777,
        "wordsWidth": 0.55,
        "decorations": true
      }
    },
    {
      "layout": "panel",
      "size": "medium",
      "expect": {
        "minHeight": 152,
        "pictureRatio": 1.7777777777777777,
        "wordsWidth": 0.62,
        "decorations": true
      }
    },
    {
      "layout": "header_card",
      "size": "medium",
      "expect": {
        "minHeight": 300,
        "pictureRatio": 1.7777777777777777,
        "wordsWidth": 0.55,
        "decorations": true
      }
    },
    {
      "layout": "header_card",
      "size": "small",
      "expect": {
        "minHeight": 240,
        "pictureRatio": 1.7777777777777777,
        "wordsWidth": 0.7,
        "decorations": true
      }
    },
    {
      "layout": "full_picture",
      "size": "large",
      "expect": {
        "minHeight": 320,
        "pictureRatio": 1.7777777777777777,
        "wordsWidth": 0.6,
        "decorations": false
      }
    },
    {
      "layout": "full_picture",
      "size": "medium",
      "expect": {
        "minHeight": 200,
        "pictureRatio": 1.7777777777777777,
        "wordsWidth": 0.8,
        "decorations": false
      }
    },
    {
      "layout": "picture_beside",
      "size": "large",
      "expect": {
        "minHeight": 280,
        "pictureRatio": 1,
        "wordsWidth": 0.5,
        "decorations": false
      }
    },
    {
      "layout": "picture_beside",
      "size": "medium",
      "expect": {
        "minHeight": 180,
        "pictureRatio": 1,
        "wordsWidth": 0.55,
        "decorations": false
      }
    },
    {
      "layout": "picture_beside",
      "size": "strip",
      "expect": {
        "minHeight": 88,
        "pictureRatio": 1,
        "wordsWidth": 0.8,
        "decorations": false
      }
    },
    {
      "layout": "tile",
      "size": "medium",
      "expect": {
        "minHeight": 220,
        "pictureRatio": 1,
        "wordsWidth": 1,
        "decorations": true
      }
    },
    {
      "layout": "tile",
      "size": "small",
      "expect": {
        "minHeight": 180,
        "pictureRatio": 1,
        "wordsWidth": 1,
        "decorations": true
      }
    },
    {
      "layout": "strip",
      "size": "strip",
      "expect": {
        "minHeight": 64,
        "pictureRatio": 1,
        "wordsWidth": 0.7,
        "decorations": false
      }
    }
  ],
  "words": [
    {
      "layout": "panel",
      "hasCode": true,
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        }
      },
      "expect": {
        "button": "Copy code",
        "label": "Code"
      }
    },
    {
      "layout": "panel",
      "hasCode": false,
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        }
      },
      "expect": {
        "button": "View offer",
        "label": "Offer"
      }
    },
    {
      "layout": "header_card",
      "hasCode": true,
      "settings": {
        "background": {
          "colour": "#c2410c",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#52525b",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "link",
          "fill": "#ffffff",
          "text": "#1d4ed8",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": false,
          "style": "filled",
          "fill": "#f4f4f5",
          "text": "#18181b"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "body": {
          "colour": "#ffffff",
          "tagColour": "#18181b"
        }
      },
      "expect": {
        "button": "Copy code",
        "label": "Code"
      }
    },
    {
      "layout": "header_card",
      "hasCode": false,
      "settings": {
        "background": {
          "colour": "#c2410c",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#52525b",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "link",
          "fill": "#ffffff",
          "text": "#1d4ed8",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": false,
          "style": "filled",
          "fill": "#f4f4f5",
          "text": "#18181b"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "body": {
          "colour": "#ffffff",
          "tagColour": "#18181b"
        }
      },
      "expect": {
        "button": "View offer",
        "label": "Offer"
      }
    },
    {
      "layout": "full_picture",
      "hasCode": true,
      "settings": {
        "background": {
          "colour": "#18181b",
          "picture": "show",
          "tint": {
            "colour": "#000000",
            "strength": 0.6
          }
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "textCorner": "bottom-start"
      },
      "expect": {
        "button": "Copy code",
        "label": "Code"
      }
    },
    {
      "layout": "full_picture",
      "hasCode": false,
      "settings": {
        "background": {
          "colour": "#18181b",
          "picture": "show",
          "tint": {
            "colour": "#000000",
            "strength": 0.6
          }
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "textCorner": "bottom-start"
      },
      "expect": {
        "button": "View offer",
        "label": "Offer"
      }
    },
    {
      "layout": "picture_beside",
      "hasCode": true,
      "settings": {
        "background": {
          "colour": "#ffffff",
          "picture": "show"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#1d4ed8",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#18181b",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#52525b",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#1d4ed8",
          "text": "#ffffff",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#18181b"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": "#e4e4e7"
        },
        "pictureSide": "end",
        "pictureFit": "cover"
      },
      "expect": {
        "button": "Copy code",
        "label": "Code"
      }
    },
    {
      "layout": "picture_beside",
      "hasCode": false,
      "settings": {
        "background": {
          "colour": "#ffffff",
          "picture": "show"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#1d4ed8",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#18181b",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#52525b",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#1d4ed8",
          "text": "#ffffff",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#18181b"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": "#e4e4e7"
        },
        "pictureSide": "end",
        "pictureFit": "cover"
      },
      "expect": {
        "button": "View offer",
        "label": "Offer"
      }
    },
    {
      "layout": "tile",
      "hasCode": true,
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "lg",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": false,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "none",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": false,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        }
      },
      "expect": {
        "button": null,
        "label": "Code"
      }
    },
    {
      "layout": "tile",
      "hasCode": false,
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "lg",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": false,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "none",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": false,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        }
      },
      "expect": {
        "button": null,
        "label": "Offer"
      }
    },
    {
      "layout": "strip",
      "hasCode": true,
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": false,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "md",
          "weight": "semibold",
          "lines": 1
        },
        "supporting": {
          "show": false,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "link",
          "fill": "#ffffff",
          "text": "#ffffff",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "lg",
          "spacing": "compact",
          "outline": null
        }
      },
      "expect": {
        "button": "Copy code",
        "label": null
      }
    },
    {
      "layout": "strip",
      "hasCode": false,
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": false,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "md",
          "weight": "semibold",
          "lines": 1
        },
        "supporting": {
          "show": false,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "link",
          "fill": "#ffffff",
          "text": "#ffffff",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "lg",
          "spacing": "compact",
          "outline": null
        }
      },
      "expect": {
        "button": "View offer",
        "label": null
      }
    },
    {
      "layout": "panel",
      "hasCode": true,
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "WINTER",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "Grab it",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        }
      },
      "expect": {
        "button": "Grab it",
        "label": "WINTER"
      }
    }
  ],
  "contrast": [
    {
      "name": "starter panel",
      "layout": "panel",
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        }
      },
      "expect": [
        {
          "pair": "label/background",
          "label": "Label on the background",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "headline/background",
          "label": "Headline on the background",
          "ratio": 6.7,
          "required": 3,
          "ok": true
        },
        {
          "pair": "supporting/background",
          "label": "Supporting line on the background",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "button/fill",
          "label": "Button words on the button",
          "ratio": 17.73,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "chip/background",
          "label": "Code on the background",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        }
      ]
    },
    {
      "name": "starter header_card",
      "layout": "header_card",
      "settings": {
        "background": {
          "colour": "#c2410c",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#52525b",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "link",
          "fill": "#ffffff",
          "text": "#1d4ed8",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": false,
          "style": "filled",
          "fill": "#f4f4f5",
          "text": "#18181b"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "body": {
          "colour": "#ffffff",
          "tagColour": "#18181b"
        }
      },
      "expect": [
        {
          "pair": "label/background",
          "label": "Label on the background",
          "ratio": 5.17,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "headline/background",
          "label": "Headline on the background",
          "ratio": 5.17,
          "required": 3,
          "ok": true
        },
        {
          "pair": "supporting/body",
          "label": "Supporting line on the card body",
          "ratio": 7.72,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "button/body",
          "label": "Button words on the card body",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "tag/body",
          "label": "Code tag on the card body",
          "ratio": 17.71,
          "required": 4.5,
          "ok": true
        }
      ]
    },
    {
      "name": "starter full_picture",
      "layout": "full_picture",
      "settings": {
        "background": {
          "colour": "#18181b",
          "picture": "show",
          "tint": {
            "colour": "#000000",
            "strength": 0.6
          }
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "textCorner": "bottom-start"
      },
      "expect": [
        {
          "pair": "label/background",
          "label": "Label on the background",
          "ratio": 17.71,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "headline/background",
          "label": "Headline on the background",
          "ratio": 17.71,
          "required": 3,
          "ok": true
        },
        {
          "pair": "label/picture-dark",
          "label": "Label on a dark picture under the tint",
          "ratio": 21,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "headline/picture-dark",
          "label": "Headline on a dark picture under the tint",
          "ratio": 21,
          "required": 3,
          "ok": true
        },
        {
          "pair": "label/picture-light",
          "label": "Label on a light picture under the tint",
          "ratio": 5.74,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "headline/picture-light",
          "label": "Headline on a light picture under the tint",
          "ratio": 5.74,
          "required": 3,
          "ok": true
        },
        {
          "pair": "supporting/background",
          "label": "Supporting line on the background",
          "ratio": 17.71,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "button/fill",
          "label": "Button words on the button",
          "ratio": 17.73,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "chip/background",
          "label": "Code on the background",
          "ratio": 17.71,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "supporting/picture-dark",
          "label": "Supporting line on a dark picture under the tint",
          "ratio": 21,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "chip/picture-dark",
          "label": "Code on a dark picture under the tint",
          "ratio": 21,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "supporting/picture-light",
          "label": "Supporting line on a light picture under the tint",
          "ratio": 5.74,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "chip/picture-light",
          "label": "Code on a light picture under the tint",
          "ratio": 5.74,
          "required": 4.5,
          "ok": true
        }
      ]
    },
    {
      "name": "starter picture_beside",
      "layout": "picture_beside",
      "settings": {
        "background": {
          "colour": "#ffffff",
          "picture": "show"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#1d4ed8",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#18181b",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#52525b",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#1d4ed8",
          "text": "#ffffff",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#18181b"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": "#e4e4e7"
        },
        "pictureSide": "end",
        "pictureFit": "cover"
      },
      "expect": [
        {
          "pair": "label/background",
          "label": "Label on the background",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "headline/background",
          "label": "Headline on the background",
          "ratio": 17.71,
          "required": 3,
          "ok": true
        },
        {
          "pair": "supporting/background",
          "label": "Supporting line on the background",
          "ratio": 7.72,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "button/fill",
          "label": "Button words on the button",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "chip/background",
          "label": "Code on the background",
          "ratio": 17.71,
          "required": 4.5,
          "ok": true
        }
      ]
    },
    {
      "name": "starter tile",
      "layout": "tile",
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "lg",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": false,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "none",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": false,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        }
      },
      "expect": [
        {
          "pair": "label/background",
          "label": "Label on the background",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "headline/background",
          "label": "Headline on the background",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        }
      ]
    },
    {
      "name": "starter strip",
      "layout": "strip",
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": false,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "md",
          "weight": "semibold",
          "lines": 1
        },
        "supporting": {
          "show": false,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "link",
          "fill": "#ffffff",
          "text": "#ffffff",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "lg",
          "spacing": "compact",
          "outline": null
        }
      },
      "expect": [
        {
          "pair": "headline/background",
          "label": "Headline on the background",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "button/background",
          "label": "Button words on the background",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "chip/background",
          "label": "Code on the background",
          "ratio": 6.7,
          "required": 4.5,
          "ok": true
        }
      ]
    },
    {
      "name": "pale headline on a weak tint fails over a light picture",
      "layout": "full_picture",
      "settings": {
        "background": {
          "colour": "#18181b",
          "picture": "show",
          "tint": {
            "colour": "#000000",
            "strength": 0.2
          }
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#bbbbbb",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "textCorner": "bottom-start"
      },
      "expect": [
        {
          "pair": "label/background",
          "label": "Label on the background",
          "ratio": 17.71,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "headline/background",
          "label": "Headline on the background",
          "ratio": 9.22,
          "required": 3,
          "ok": true
        },
        {
          "pair": "label/picture-dark",
          "label": "Label on a dark picture under the tint",
          "ratio": 21,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "headline/picture-dark",
          "label": "Headline on a dark picture under the tint",
          "ratio": 10.93,
          "required": 3,
          "ok": true
        },
        {
          "pair": "label/picture-light",
          "label": "Label on a light picture under the tint",
          "ratio": 1.6,
          "required": 4.5,
          "ok": false
        },
        {
          "pair": "headline/picture-light",
          "label": "Headline on a light picture under the tint",
          "ratio": 1.19,
          "required": 3,
          "ok": false
        },
        {
          "pair": "supporting/background",
          "label": "Supporting line on the background",
          "ratio": 17.71,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "button/fill",
          "label": "Button words on the button",
          "ratio": 17.73,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "chip/background",
          "label": "Code on the background",
          "ratio": 17.71,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "supporting/picture-dark",
          "label": "Supporting line on a dark picture under the tint",
          "ratio": 21,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "chip/picture-dark",
          "label": "Code on a dark picture under the tint",
          "ratio": 21,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "supporting/picture-light",
          "label": "Supporting line on a light picture under the tint",
          "ratio": 1.6,
          "required": 4.5,
          "ok": false
        },
        {
          "pair": "chip/picture-light",
          "label": "Code on a light picture under the tint",
          "ratio": 1.6,
          "required": 4.5,
          "ok": false
        }
      ]
    },
    {
      "name": "white words on yellow fail",
      "layout": "panel",
      "settings": {
        "background": {
          "colour": "#facc15",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        }
      },
      "expect": [
        {
          "pair": "label/background",
          "label": "Label on the background",
          "ratio": 1.53,
          "required": 4.5,
          "ok": false
        },
        {
          "pair": "headline/background",
          "label": "Headline on the background",
          "ratio": 1.53,
          "required": 3,
          "ok": false
        },
        {
          "pair": "supporting/background",
          "label": "Supporting line on the background",
          "ratio": 1.53,
          "required": 4.5,
          "ok": false
        },
        {
          "pair": "button/fill",
          "label": "Button words on the button",
          "ratio": 17.73,
          "required": 4.5,
          "ok": true
        },
        {
          "pair": "chip/background",
          "label": "Code on the background",
          "ratio": 1.53,
          "required": 4.5,
          "ok": false
        }
      ]
    }
  ],
  "pick": [
    {
      "name": "a chosen picture wins",
      "layout": "full_picture",
      "settings": {
        "background": {
          "colour": "#18181b",
          "picture": "show",
          "tint": {
            "colour": "#000000",
            "strength": 0.6
          }
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "textCorner": "bottom-start"
      },
      "pictures": [
        {
          "id": "wide",
          "width": 1600,
          "height": 900,
          "position": 0
        },
        {
          "id": "square",
          "width": 1000,
          "height": 1000,
          "position": 1
        },
        {
          "id": "tall",
          "width": 800,
          "height": 1200,
          "position": 2
        }
      ],
      "chosenId": "tall",
      "expect": "tall"
    },
    {
      "name": "wide layout picks the wide one",
      "layout": "full_picture",
      "settings": {
        "background": {
          "colour": "#18181b",
          "picture": "show",
          "tint": {
            "colour": "#000000",
            "strength": 0.6
          }
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "textCorner": "bottom-start"
      },
      "pictures": [
        {
          "id": "wide",
          "width": 1600,
          "height": 900,
          "position": 0
        },
        {
          "id": "square",
          "width": 1000,
          "height": 1000,
          "position": 1
        },
        {
          "id": "tall",
          "width": 800,
          "height": 1200,
          "position": 2
        }
      ],
      "chosenId": null,
      "expect": "wide"
    },
    {
      "name": "square layout picks the square one",
      "layout": "picture_beside",
      "settings": {
        "background": {
          "colour": "#ffffff",
          "picture": "show"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#1d4ed8",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#18181b",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#52525b",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#1d4ed8",
          "text": "#ffffff",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#18181b"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": "#e4e4e7"
        },
        "pictureSide": "end",
        "pictureFit": "cover"
      },
      "pictures": [
        {
          "id": "wide",
          "width": 1600,
          "height": 900,
          "position": 0
        },
        {
          "id": "square",
          "width": 1000,
          "height": 1000,
          "position": 1
        },
        {
          "id": "tall",
          "width": 800,
          "height": 1200,
          "position": 2
        }
      ],
      "chosenId": null,
      "expect": "square"
    },
    {
      "name": "a chosen picture that was removed falls back to the best fit",
      "layout": "picture_beside",
      "settings": {
        "background": {
          "colour": "#ffffff",
          "picture": "show"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#1d4ed8",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#18181b",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#52525b",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#1d4ed8",
          "text": "#ffffff",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#18181b"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": "#e4e4e7"
        },
        "pictureSide": "end",
        "pictureFit": "cover"
      },
      "pictures": [
        {
          "id": "wide",
          "width": 1600,
          "height": 900,
          "position": 0
        },
        {
          "id": "square",
          "width": 1000,
          "height": 1000,
          "position": 1
        },
        {
          "id": "tall",
          "width": 800,
          "height": 1200,
          "position": 2
        }
      ],
      "chosenId": "gone",
      "expect": "square"
    },
    {
      "name": "optional layout with picture off shows none",
      "layout": "panel",
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        }
      },
      "pictures": [
        {
          "id": "wide",
          "width": 1600,
          "height": 900,
          "position": 0
        },
        {
          "id": "square",
          "width": 1000,
          "height": 1000,
          "position": 1
        },
        {
          "id": "tall",
          "width": 800,
          "height": 1200,
          "position": 2
        }
      ],
      "chosenId": "wide",
      "expect": null
    },
    {
      "name": "no pictures, none shown",
      "layout": "full_picture",
      "settings": {
        "background": {
          "colour": "#18181b",
          "picture": "show",
          "tint": {
            "colour": "#000000",
            "strength": 0.6
          }
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": false,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "textCorner": "bottom-start"
      },
      "pictures": [],
      "chosenId": null,
      "expect": null
    }
  ],
  "appearance": [
    {
      "name": "no dark colours: the same in both",
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        }
      },
      "expect": "#1d4ed8"
    },
    {
      "name": "dark background used in dark",
      "settings": {
        "background": {
          "colour": "#1d4ed8",
          "picture": "none"
        },
        "label": {
          "show": true,
          "words": "auto",
          "colour": "#ffffff",
          "size": "xs",
          "tracking": "wide"
        },
        "headline": {
          "colour": "#ffffff",
          "size": "xl",
          "weight": "semibold",
          "lines": 2
        },
        "supporting": {
          "show": true,
          "colour": "#ffffff",
          "size": "sm",
          "weight": "regular",
          "lines": 2
        },
        "button": {
          "style": "filled",
          "fill": "#ffffff",
          "text": "#111827",
          "words": "auto",
          "icon": true
        },
        "chip": {
          "show": true,
          "style": "dashed",
          "fill": "#ffffff",
          "text": "#ffffff"
        },
        "decorations": {
          "show": true,
          "set": "food",
          "colour": "#ffffff",
          "strength": 0.2
        },
        "align": "start",
        "shape": {
          "radius": "xl",
          "spacing": "regular",
          "outline": null
        },
        "dark": {
          "background": {
            "colour": "#0f172a",
            "picture": "none"
          }
        }
      },
      "expect": "#0f172a"
    }
  ]
}
"""
