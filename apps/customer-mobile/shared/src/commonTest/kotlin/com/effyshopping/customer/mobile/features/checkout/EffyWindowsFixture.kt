package com.effyshopping.customer.mobile.features.checkout

/**
 * A copy of `packages/shared-types/src/effy-windows.fixtures.json`, embedded because `commonTest` cannot read a file outside the app. Do not edit by hand:
 * `packages/shared-types/src/effy-windows.test.ts` reads this file and fails if it differs. Change the source first, then copy it here.
 */
internal const val EFFY_WINDOWS_FIXTURE = """
{
  "_comment": "078 - shared by packages/shared-types (TypeScript: effyWindowsView) and customer-mobile (Kotlin: effyWindowsView). `input` is a quote's effyWindows; `expect` is what the picker shows at `now`. A case that passes in one and fails in the other is the defect this file exists to catch. 085 - a day's `anyTime` and `asap` are part of the view.",
  "cases": [
    {
      "name": "today has two windows left; a full Saturday; a surcharged evening",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "unavailable": null,
        "days": [
          {
            "date": "2026-10-08",
            "section": "same_day",
            "closedReason": null,
            "windows": [
              {
                "slotId": "afternoon",
                "date": "2026-10-08",
                "startAt": "2026-10-08T16:00:00+11:00",
                "endAt": "2026-10-08T18:00:00+11:00",
                "cutoffAt": "2026-10-08T14:00:00+11:00",
                "surchargeAmount": "5.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    },
                    {
                      "kind": "window_surcharge",
                      "amount": "5.00"
                    }
                  ],
                  "totalAmount": "11.00"
                }
              },
              {
                "slotId": "evening",
                "date": "2026-10-08",
                "startAt": "2026-10-08T18:30:00+11:00",
                "endAt": "2026-10-08T20:30:00+11:00",
                "cutoffAt": "2026-10-08T17:15:00+11:00",
                "surchargeAmount": "7.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    },
                    {
                      "kind": "window_surcharge",
                      "amount": "7.00"
                    }
                  ],
                  "totalAmount": "13.00"
                }
              }
            ]
          },
          {
            "date": "2026-10-09",
            "section": "standard",
            "closedReason": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-09",
                "startAt": "2026-10-09T10:00:00+11:00",
                "endAt": "2026-10-09T12:00:00+11:00",
                "cutoffAt": "2026-10-09T09:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              },
              {
                "slotId": "afternoon",
                "date": "2026-10-09",
                "startAt": "2026-10-09T16:00:00+11:00",
                "endAt": "2026-10-09T18:00:00+11:00",
                "cutoffAt": "2026-10-09T14:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              },
              {
                "slotId": "evening",
                "date": "2026-10-09",
                "startAt": "2026-10-09T18:30:00+11:00",
                "endAt": "2026-10-09T20:30:00+11:00",
                "cutoffAt": "2026-10-09T17:15:00+11:00",
                "surchargeAmount": "2.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    },
                    {
                      "kind": "window_surcharge",
                      "amount": "2.00"
                    }
                  ],
                  "totalAmount": "8.00"
                }
              }
            ]
          },
          {
            "date": "2026-10-10",
            "section": "standard",
            "closedReason": "full",
            "windows": []
          },
          {
            "date": "2026-10-12",
            "section": "standard",
            "closedReason": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-12",
                "startAt": "2026-10-12T10:00:00+11:00",
                "endAt": "2026-10-12T12:00:00+11:00",
                "cutoffAt": "2026-10-12T09:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              }
            ]
          }
        ]
      },
      "expect": {
        "unavailable": null,
        "sameDayTitle": "Same-day delivery",
        "standardTitle": "Standard delivery",
        "today": {
          "date": "2026-10-08",
          "label": "Thu 8 Oct",
          "sentence": null,
          "windows": [
            {
              "slotId": "afternoon",
              "date": "2026-10-08",
              "label": "4 pm – 6 pm",
              "note": "Order by 2 pm",
              "closed": false,
              "surchargeAmount": "5.00"
            },
            {
              "slotId": "evening",
              "date": "2026-10-08",
              "label": "6:30 pm – 8:30 pm",
              "note": "Order by 5:15 pm",
              "closed": false,
              "surchargeAmount": "7.00"
            }
          ],
          "anyTime": null
        },
        "later": [
          {
            "date": "2026-10-09",
            "label": "Fri 9 Oct",
            "sentence": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-09",
                "label": "10 am – 12 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              },
              {
                "slotId": "afternoon",
                "date": "2026-10-09",
                "label": "4 pm – 6 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              },
              {
                "slotId": "evening",
                "date": "2026-10-09",
                "label": "6:30 pm – 8:30 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": "2.00"
              }
            ],
            "anyTime": null
          },
          {
            "date": "2026-10-10",
            "label": "Sat 10 Oct",
            "sentence": "Every window on this day is taken.",
            "windows": [],
            "anyTime": null
          },
          {
            "date": "2026-10-12",
            "label": "Mon 12 Oct",
            "sentence": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-12",
                "label": "10 am – 12 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              }
            ],
            "anyTime": null
          }
        ],
        "asap": null
      }
    },
    {
      "name": "no windows left today; a window whose cutoff has passed since the quote is shown closed",
      "now": "2026-10-08T14:01:00+11:00",
      "input": {
        "unavailable": null,
        "days": [
          {
            "date": "2026-10-08",
            "section": "same_day",
            "closedReason": null,
            "windows": [
              {
                "slotId": "afternoon",
                "date": "2026-10-08",
                "startAt": "2026-10-08T16:00:00+11:00",
                "endAt": "2026-10-08T18:00:00+11:00",
                "cutoffAt": "2026-10-08T14:00:00+11:00",
                "surchargeAmount": "5.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    },
                    {
                      "kind": "window_surcharge",
                      "amount": "5.00"
                    }
                  ],
                  "totalAmount": "11.00"
                }
              }
            ]
          },
          {
            "date": "2026-10-09",
            "section": "standard",
            "closedReason": null,
            "windows": [
              {
                "slotId": "afternoon",
                "date": "2026-10-09",
                "startAt": "2026-10-09T16:00:00+11:00",
                "endAt": "2026-10-09T18:00:00+11:00",
                "cutoffAt": "2026-10-09T14:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              }
            ]
          }
        ]
      },
      "expect": {
        "unavailable": null,
        "sameDayTitle": "Same-day delivery",
        "standardTitle": "Standard delivery",
        "today": {
          "date": "2026-10-08",
          "label": "Thu 8 Oct",
          "sentence": null,
          "windows": [
            {
              "slotId": "afternoon",
              "date": "2026-10-08",
              "label": "4 pm – 6 pm",
              "note": "Closed",
              "closed": true,
              "surchargeAmount": "5.00"
            }
          ],
          "anyTime": null
        },
        "later": [
          {
            "date": "2026-10-09",
            "label": "Fri 9 Oct",
            "sentence": null,
            "windows": [
              {
                "slotId": "afternoon",
                "date": "2026-10-09",
                "label": "4 pm – 6 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              }
            ],
            "anyTime": null
          }
        ],
        "asap": null
      }
    },
    {
      "name": "today closed and today not a delivery day are two different sentences",
      "now": "2026-10-11T18:00:00+11:00",
      "input": {
        "unavailable": null,
        "days": [
          {
            "date": "2026-10-11",
            "section": "same_day",
            "closedReason": "not_delivery_day",
            "windows": []
          },
          {
            "date": "2026-10-12",
            "section": "standard",
            "closedReason": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-12",
                "startAt": "2026-10-12T10:00:00+11:00",
                "endAt": "2026-10-12T12:00:00+11:00",
                "cutoffAt": "2026-10-12T09:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              }
            ]
          }
        ]
      },
      "expect": {
        "unavailable": null,
        "sameDayTitle": "Same-day delivery",
        "standardTitle": "Standard delivery",
        "today": {
          "date": "2026-10-11",
          "label": "Sun 11 Oct",
          "sentence": "We don't deliver today.",
          "windows": [],
          "anyTime": null
        },
        "later": [
          {
            "date": "2026-10-12",
            "label": "Mon 12 Oct",
            "sentence": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-12",
                "label": "10 am – 12 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              }
            ],
            "anyTime": null
          }
        ],
        "asap": null
      }
    },
    {
      "name": "today's windows have all gone",
      "now": "2026-10-08T20:00:00+11:00",
      "input": {
        "unavailable": null,
        "days": [
          {
            "date": "2026-10-08",
            "section": "same_day",
            "closedReason": "closed",
            "windows": []
          },
          {
            "date": "2026-10-09",
            "section": "standard",
            "closedReason": "full",
            "windows": []
          },
          {
            "date": "2026-10-10",
            "section": "standard",
            "closedReason": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-10",
                "startAt": "2026-10-10T10:00:00+11:00",
                "endAt": "2026-10-10T12:00:00+11:00",
                "cutoffAt": "2026-10-10T09:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              }
            ]
          }
        ]
      },
      "expect": {
        "unavailable": null,
        "sameDayTitle": "Same-day delivery",
        "standardTitle": "Standard delivery",
        "today": {
          "date": "2026-10-08",
          "label": "Thu 8 Oct",
          "sentence": "No windows left today.",
          "windows": [],
          "anyTime": null
        },
        "later": [
          {
            "date": "2026-10-09",
            "label": "Fri 9 Oct",
            "sentence": "Every window on this day is taken.",
            "windows": [],
            "anyTime": null
          },
          {
            "date": "2026-10-10",
            "label": "Sat 10 Oct",
            "sentence": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-10",
                "label": "10 am – 12 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              }
            ],
            "anyTime": null
          }
        ],
        "asap": null
      }
    },
    {
      "name": "nothing on any day",
      "now": "2026-10-08T20:00:00+11:00",
      "input": {
        "unavailable": "no_windows",
        "days": [
          {
            "date": "2026-10-08",
            "section": "same_day",
            "closedReason": "closed",
            "windows": []
          },
          {
            "date": "2026-10-09",
            "section": "standard",
            "closedReason": "full",
            "windows": []
          }
        ]
      },
      "expect": {
        "unavailable": "There are no delivery windows available in the next few days. Please try again later.",
        "sameDayTitle": "Same-day delivery",
        "standardTitle": "Standard delivery",
        "today": {
          "date": "2026-10-08",
          "label": "Thu 8 Oct",
          "sentence": "No windows left today.",
          "windows": [],
          "anyTime": null
        },
        "later": [
          {
            "date": "2026-10-09",
            "label": "Fri 9 Oct",
            "sentence": "Every window on this day is taken.",
            "windows": [],
            "anyTime": null
          }
        ],
        "asap": null
      }
    },
    {
      "name": "after the clocks go back the times are still Melbourne's",
      "now": "2027-04-05T09:00:00+10:00",
      "input": {
        "unavailable": null,
        "days": [
          {
            "date": "2027-04-05",
            "section": "same_day",
            "closedReason": null,
            "windows": [
              {
                "slotId": "afternoon",
                "date": "2027-04-05",
                "startAt": "2027-04-05T16:00:00+10:00",
                "endAt": "2027-04-05T18:00:00+10:00",
                "cutoffAt": "2027-04-05T14:00:00+10:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              }
            ]
          }
        ]
      },
      "expect": {
        "unavailable": null,
        "sameDayTitle": "Same-day delivery",
        "standardTitle": "Standard delivery",
        "today": {
          "date": "2027-04-05",
          "label": "Mon 5 Apr",
          "sentence": null,
          "windows": [
            {
              "slotId": "afternoon",
              "date": "2027-04-05",
              "label": "4 pm – 6 pm",
              "note": "Order by 2 pm",
              "closed": false,
              "surchargeAmount": null
            }
          ],
          "anyTime": null
        },
        "later": [],
        "asap": null
      }
    },
    {
      "name": "085 - a day with no time: offered on a later day, on a day whose windows are all taken, never today; and as soon as possible",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "unavailable": null,
        "days": [
          {
            "date": "2026-10-08",
            "section": "same_day",
            "closedReason": null,
            "windows": [
              {
                "slotId": "afternoon",
                "date": "2026-10-08",
                "startAt": "2026-10-08T16:00:00+11:00",
                "endAt": "2026-10-08T18:00:00+11:00",
                "cutoffAt": "2026-10-08T14:00:00+11:00",
                "surchargeAmount": "5.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    },
                    {
                      "kind": "window_surcharge",
                      "amount": "5.00"
                    }
                  ],
                  "totalAmount": "11.00"
                }
              },
              {
                "slotId": "evening",
                "date": "2026-10-08",
                "startAt": "2026-10-08T18:30:00+11:00",
                "endAt": "2026-10-08T20:30:00+11:00",
                "cutoffAt": "2026-10-08T17:15:00+11:00",
                "surchargeAmount": "7.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    },
                    {
                      "kind": "window_surcharge",
                      "amount": "7.00"
                    }
                  ],
                  "totalAmount": "13.00"
                }
              }
            ],
            "anyTime": {
              "slotId": "anytime",
              "date": "2026-10-08",
              "startAt": "2026-10-08T12:00:00+11:00",
              "endAt": "2026-10-08T21:00:00+11:00",
              "cutoffAt": "2026-10-08T10:00:00+11:00",
              "surchargeAmount": "0.00",
              "fee": {
                "lines": [
                  {
                    "kind": "delivery",
                    "amount": "6.00"
                  }
                ],
                "totalAmount": "6.00"
              }
            }
          },
          {
            "date": "2026-10-09",
            "section": "standard",
            "closedReason": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-09",
                "startAt": "2026-10-09T10:00:00+11:00",
                "endAt": "2026-10-09T12:00:00+11:00",
                "cutoffAt": "2026-10-09T09:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              },
              {
                "slotId": "afternoon",
                "date": "2026-10-09",
                "startAt": "2026-10-09T16:00:00+11:00",
                "endAt": "2026-10-09T18:00:00+11:00",
                "cutoffAt": "2026-10-09T14:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              },
              {
                "slotId": "evening",
                "date": "2026-10-09",
                "startAt": "2026-10-09T18:30:00+11:00",
                "endAt": "2026-10-09T20:30:00+11:00",
                "cutoffAt": "2026-10-09T17:15:00+11:00",
                "surchargeAmount": "2.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    },
                    {
                      "kind": "window_surcharge",
                      "amount": "2.00"
                    }
                  ],
                  "totalAmount": "8.00"
                }
              }
            ],
            "anyTime": {
              "slotId": "anytime",
              "date": "2026-10-09",
              "startAt": "2026-10-09T12:00:00+11:00",
              "endAt": "2026-10-09T21:00:00+11:00",
              "cutoffAt": "2026-10-09T10:00:00+11:00",
              "surchargeAmount": "0.00",
              "fee": {
                "lines": [
                  {
                    "kind": "delivery",
                    "amount": "6.00"
                  }
                ],
                "totalAmount": "6.00"
              }
            }
          },
          {
            "date": "2026-10-10",
            "section": "standard",
            "closedReason": "full",
            "windows": [],
            "anyTime": {
              "slotId": "anytime",
              "date": "2026-10-10",
              "startAt": "2026-10-10T12:00:00+11:00",
              "endAt": "2026-10-10T21:00:00+11:00",
              "cutoffAt": "2026-10-10T10:00:00+11:00",
              "surchargeAmount": "0.00",
              "fee": {
                "lines": [
                  {
                    "kind": "delivery",
                    "amount": "6.00"
                  }
                ],
                "totalAmount": "6.00"
              }
            }
          },
          {
            "date": "2026-10-12",
            "section": "standard",
            "closedReason": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-12",
                "startAt": "2026-10-12T10:00:00+11:00",
                "endAt": "2026-10-12T12:00:00+11:00",
                "cutoffAt": "2026-10-12T09:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              }
            ],
            "anyTime": null
          }
        ],
        "asap": {
          "estimate": "usually within 2–3 days",
          "fee": {
            "lines": [
              {
                "kind": "delivery",
                "amount": "6.00"
              }
            ],
            "totalAmount": "6.00"
          }
        }
      },
      "expect": {
        "unavailable": null,
        "sameDayTitle": "Same-day delivery",
        "standardTitle": "Standard delivery",
        "today": {
          "date": "2026-10-08",
          "label": "Thu 8 Oct",
          "sentence": null,
          "windows": [
            {
              "slotId": "afternoon",
              "date": "2026-10-08",
              "label": "4 pm – 6 pm",
              "note": "Order by 2 pm",
              "closed": false,
              "surchargeAmount": "5.00"
            },
            {
              "slotId": "evening",
              "date": "2026-10-08",
              "label": "6:30 pm – 8:30 pm",
              "note": "Order by 5:15 pm",
              "closed": false,
              "surchargeAmount": "7.00"
            }
          ],
          "anyTime": null
        },
        "later": [
          {
            "date": "2026-10-09",
            "label": "Fri 9 Oct",
            "sentence": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-09",
                "label": "10 am – 12 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              },
              {
                "slotId": "afternoon",
                "date": "2026-10-09",
                "label": "4 pm – 6 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              },
              {
                "slotId": "evening",
                "date": "2026-10-09",
                "label": "6:30 pm – 8:30 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": "2.00"
              }
            ],
            "anyTime": {
              "slotId": "anytime",
              "date": "2026-10-09"
            }
          },
          {
            "date": "2026-10-10",
            "label": "Sat 10 Oct",
            "sentence": "Every window on this day is taken.",
            "windows": [],
            "anyTime": {
              "slotId": "anytime",
              "date": "2026-10-10"
            }
          },
          {
            "date": "2026-10-12",
            "label": "Mon 12 Oct",
            "sentence": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-12",
                "label": "10 am – 12 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              }
            ],
            "anyTime": null
          }
        ],
        "asap": {
          "title": "Standard",
          "hint": "We'll deliver as soon as we can.",
          "estimate": "usually within 2–3 days"
        }
      }
    },
    {
      "name": "097 - today not offered at this address: no same_day day is sent, so there is no Same-day section; the later days are exactly as before",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "unavailable": null,
        "days": [
          {
            "date": "2026-10-09",
            "section": "standard",
            "closedReason": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-09",
                "startAt": "2026-10-09T10:00:00+11:00",
                "endAt": "2026-10-09T12:00:00+11:00",
                "cutoffAt": "2026-10-09T09:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              },
              {
                "slotId": "afternoon",
                "date": "2026-10-09",
                "startAt": "2026-10-09T16:00:00+11:00",
                "endAt": "2026-10-09T18:00:00+11:00",
                "cutoffAt": "2026-10-09T14:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              },
              {
                "slotId": "evening",
                "date": "2026-10-09",
                "startAt": "2026-10-09T18:30:00+11:00",
                "endAt": "2026-10-09T20:30:00+11:00",
                "cutoffAt": "2026-10-09T17:15:00+11:00",
                "surchargeAmount": "2.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    },
                    {
                      "kind": "window_surcharge",
                      "amount": "2.00"
                    }
                  ],
                  "totalAmount": "8.00"
                }
              }
            ]
          },
          {
            "date": "2026-10-10",
            "section": "standard",
            "closedReason": "full",
            "windows": []
          },
          {
            "date": "2026-10-12",
            "section": "standard",
            "closedReason": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-12",
                "startAt": "2026-10-12T10:00:00+11:00",
                "endAt": "2026-10-12T12:00:00+11:00",
                "cutoffAt": "2026-10-12T09:00:00+11:00",
                "surchargeAmount": "0.00",
                "fee": {
                  "lines": [
                    {
                      "kind": "delivery",
                      "amount": "6.00"
                    }
                  ],
                  "totalAmount": "6.00"
                }
              }
            ]
          }
        ]
      },
      "expect": {
        "unavailable": null,
        "sameDayTitle": "Same-day delivery",
        "standardTitle": "Standard delivery",
        "today": null,
        "later": [
          {
            "date": "2026-10-09",
            "label": "Fri 9 Oct",
            "sentence": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-09",
                "label": "10 am – 12 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              },
              {
                "slotId": "afternoon",
                "date": "2026-10-09",
                "label": "4 pm – 6 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              },
              {
                "slotId": "evening",
                "date": "2026-10-09",
                "label": "6:30 pm – 8:30 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": "2.00"
              }
            ],
            "anyTime": null
          },
          {
            "date": "2026-10-10",
            "label": "Sat 10 Oct",
            "sentence": "Every window on this day is taken.",
            "windows": [],
            "anyTime": null
          },
          {
            "date": "2026-10-12",
            "label": "Mon 12 Oct",
            "sentence": null,
            "windows": [
              {
                "slotId": "morning",
                "date": "2026-10-12",
                "label": "10 am – 12 pm",
                "note": null,
                "closed": false,
                "surchargeAmount": null
              }
            ],
            "anyTime": null
          }
        ],
        "asap": null
      }
    }
  ]
}
"""
