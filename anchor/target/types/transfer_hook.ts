/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/transfer_hook.json`.
 */
export type TransferHook = {
  "address": "Hos5X6SbGqyDb8FfvRgiDqWpTE9C6FcgAkXrTeryUXwB",
  "metadata": {
    "name": "transferHook",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "initializeExtraAccountMetaList",
      "discriminator": [
        92,
        197,
        174,
        197,
        41,
        124,
        19,
        3
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "extraAccountMetaList",
          "docs": [
            "CHECK"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "wsolMint"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeUserKyc",
      "discriminator": [
        132,
        215,
        38,
        127,
        13,
        162,
        234,
        47
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "user",
          "docs": [
            "CHECK"
          ]
        },
        {
          "name": "userKyc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  45,
                  107,
                  121,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "kycLevel",
          "type": "u8"
        },
        {
          "name": "country",
          "type": "string"
        },
        {
          "name": "state",
          "type": "string"
        },
        {
          "name": "city",
          "type": "string"
        }
      ]
    },
    {
      "name": "transferHook",
      "discriminator": [
        105,
        37,
        101,
        197,
        75,
        251,
        102,
        26
      ],
      "accounts": [
        {
          "name": "sourceToken"
        },
        {
          "name": "mint"
        },
        {
          "name": "destinationToken"
        },
        {
          "name": "owner"
        },
        {
          "name": "extraAccountMetaList",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "userKyc",
          "docs": [
            "PDA user KYC, must belong to owner"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  45,
                  107,
                  121,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "updateExtraAccountMetaList",
      "discriminator": [
        44,
        125,
        141,
        226,
        97,
        179,
        166,
        96
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "extraAccountMetaList",
          "docs": [
            "CHECK"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "wsolMint"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "updateUserKyc",
      "discriminator": [
        186,
        243,
        85,
        149,
        116,
        39,
        88,
        200
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "user",
          "docs": [
            "CHECK"
          ]
        },
        {
          "name": "userKyc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  45,
                  107,
                  121,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newKycLevel",
          "type": {
            "option": "u8"
          }
        },
        {
          "name": "newRiskScore",
          "type": {
            "option": "u8"
          }
        },
        {
          "name": "flagsToSet",
          "type": {
            "option": "u8"
          }
        },
        {
          "name": "flagsToClear",
          "type": {
            "option": "u8"
          }
        },
        {
          "name": "newCountry",
          "type": {
            "option": "string"
          }
        },
        {
          "name": "newState",
          "type": {
            "option": "string"
          }
        },
        {
          "name": "newCity",
          "type": {
            "option": "string"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "userKyc",
      "discriminator": [
        99,
        72,
        143,
        203,
        143,
        117,
        146,
        250
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "userKycNotFound",
      "msg": "User KYC not found"
    },
    {
      "code": 6001,
      "name": "userNotEligible",
      "msg": "User not eligible to trade"
    },
    {
      "code": 6002,
      "name": "userSanctioned",
      "msg": "User sanctioned"
    },
    {
      "code": 6003,
      "name": "userAccountFrozen",
      "msg": "User account frozen"
    },
    {
      "code": 6004,
      "name": "userNotKycVerified",
      "msg": "User not KYC verified"
    },
    {
      "code": 6005,
      "name": "invalidKycLevel",
      "msg": "Invalid KYC level"
    },
    {
      "code": 6006,
      "name": "invalidCountryCode",
      "msg": "Invalid country code"
    },
    {
      "code": 6007,
      "name": "invalidStateCode",
      "msg": "Invalid state code"
    },
    {
      "code": 6008,
      "name": "invalidCityName",
      "msg": "Invalid city name"
    }
  ],
  "types": [
    {
      "name": "userKyc",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "kycLevel",
            "type": "u8"
          },
          {
            "name": "riskScore",
            "type": "u8"
          },
          {
            "name": "lastUpdated",
            "type": "i64"
          },
          {
            "name": "flags",
            "type": "u8"
          },
          {
            "name": "dailyVolume",
            "type": "u64"
          },
          {
            "name": "monthlyVolume",
            "type": "u64"
          },
          {
            "name": "lastResetDay",
            "type": "i64"
          },
          {
            "name": "lastResetMonth",
            "type": "i64"
          },
          {
            "name": "country",
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          },
          {
            "name": "state",
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          },
          {
            "name": "city",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    }
  ]
};
