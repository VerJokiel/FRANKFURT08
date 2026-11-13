"""Configuration of the European market pages (cac40.html, ibex35.html, ftsemib.html, wig20.html,
ftse100.html): index and member tickers, sectors, trading hours, holidays and rates sources.

Single source of truth for python/build_market.py (daily data), python/build_market_live.py and
python/markets_loop.py (5-minute bars) and python/make_market_pages.py (the HTML pages).
The DAX page keeps its own scripts (build_dax40.py, build_live.py, live_loop.py).

Members: (code, Yahoo symbol, name, sector, fallback weight %). The fallback weight is used only
when no market capitalisation comes back. Update each list after the index's quarterly review.
Holidays: weekday closures of the exchange; extend every December from the exchange calendar,
in this file only (the pages read them from the generated config).
"""
from __future__ import annotations

# ------------------------------------------------------------------ member lists
CAC40 = [  # Euronext list after the December 2025 review (Eiffage in, Edenred out); no changes in 2026 reviews
    ("MC", "MC.PA", "LVMH", "Consumer & Luxury", 10.0), ("SU", "SU.PA", "Schneider Electric", "Industrials", 8.0),
    ("TTE", "TTE.PA", "TotalEnergies", "Energy & Utilities", 7.0), ("AIR", "AIR.PA", "Airbus", "Industrials", 6.5),
    ("SAF", "SAF.PA", "Safran", "Industrials", 6.0), ("OR", "OR.PA", "L'Oréal", "Consumer & Luxury", 6.0),
    ("SAN", "SAN.PA", "Sanofi", "Healthcare", 6.0), ("AI", "AI.PA", "Air Liquide", "Materials", 5.0),
    ("RMS", "RMS.PA", "Hermès", "Consumer & Luxury", 4.0), ("EL", "EL.PA", "EssilorLuxottica", "Healthcare", 4.5),
    ("BNP", "BNP.PA", "BNP Paribas", "Financials", 4.5), ("CS", "CS.PA", "AXA", "Financials", 4.0),
    ("DG", "DG.PA", "Vinci", "Construction & Real estate", 3.5), ("SGO", "SGO.PA", "Saint-Gobain", "Construction & Real estate", 2.5),
    ("ENGI", "ENGI.PA", "Engie", "Energy & Utilities", 2.5), ("BN", "BN.PA", "Danone", "Consumer & Luxury", 2.5),
    ("LR", "LR.PA", "Legrand", "Industrials", 2.0), ("HO", "HO.PA", "Thales", "Industrials", 2.0),
    ("GLE", "GLE.PA", "Société Générale", "Financials", 2.0), ("ACA", "ACA.PA", "Crédit Agricole", "Financials", 1.5),
    ("ORA", "ORA.PA", "Orange", "Tech, Telecom & Media", 1.5), ("KER", "KER.PA", "Kering", "Consumer & Luxury", 1.0),
    ("RI", "RI.PA", "Pernod Ricard", "Consumer & Luxury", 1.0), ("CAP", "CAP.PA", "Capgemini", "Tech, Telecom & Media", 1.0),
    ("DSY", "DSY.PA", "Dassault Systèmes", "Tech, Telecom & Media", 1.0), ("STMPA", "STMPA.PA", "STMicroelectronics", "Tech, Telecom & Media", 1.0),
    ("PUB", "PUB.PA", "Publicis", "Tech, Telecom & Media", 1.0), ("ML", "ML.PA", "Michelin", "Autos", 1.0),
    ("VIE", "VIE.PA", "Veolia", "Energy & Utilities", 1.0), ("ENX", "ENX.PA", "Euronext", "Financials", 0.8),
    ("MT", "MT.AS", "ArcelorMittal", "Materials", 0.8), ("STLAP", "STLAP.PA", "Stellantis", "Autos", 0.8),
    ("BVI", "BVI.PA", "Bureau Veritas", "Industrials", 0.7), ("URW", "URW.PA", "Unibail-Rodamco-Westfield", "Construction & Real estate", 0.7),
    ("AC", "AC.PA", "Accor", "Consumer & Luxury", 0.6), ("FGR", "FGR.PA", "Eiffage", "Construction & Real estate", 0.6),
    ("CA", "CA.PA", "Carrefour", "Consumer & Luxury", 0.5), ("EN", "EN.PA", "Bouygues", "Construction & Real estate", 0.5),
    ("ERF", "ERF.PA", "Eurofins Scientific", "Healthcare", 0.5), ("RNO", "RNO.PA", "Renault", "Autos", 0.4),
]

IBEX35 = [  # unchanged since July 2024 (Puig for Meliá); reviews of 2025 and March/June 2026 kept the list
    ("SAN", "SAN.MC", "Banco Santander", "Financials", 15.0), ("IBE", "IBE.MC", "Iberdrola", "Utilities & Energy", 13.0),
    ("ITX", "ITX.MC", "Inditex", "Consumer", 12.0), ("BBVA", "BBVA.MC", "BBVA", "Financials", 11.0),
    ("CABK", "CABK.MC", "CaixaBank", "Financials", 6.0), ("FER", "FER.MC", "Ferrovial", "Infrastructure & Construction", 4.5),
    ("AMS", "AMS.MC", "Amadeus", "Travel & Transport", 4.0), ("AENA", "AENA.MC", "Aena", "Travel & Transport", 3.5),
    ("TEF", "TEF.MC", "Telefónica", "Tech & Telecom", 3.5), ("CLNX", "CLNX.MC", "Cellnex", "Tech & Telecom", 3.0),
    ("REP", "REP.MC", "Repsol", "Utilities & Energy", 2.5), ("SAB", "SAB.MC", "Banco Sabadell", "Financials", 2.5),
    ("ACS", "ACS.MC", "ACS", "Infrastructure & Construction", 2.0), ("IAG", "IAG.MC", "IAG", "Travel & Transport", 2.0),
    ("BKT", "BKT.MC", "Bankinter", "Financials", 1.5), ("ELE", "ELE.MC", "Endesa", "Utilities & Energy", 1.5),
    ("NTGY", "NTGY.MC", "Naturgy", "Utilities & Energy", 1.0), ("RED", "RED.MC", "Redeia", "Utilities & Energy", 1.0),
    ("IDR", "IDR.MC", "Indra", "Tech & Telecom", 1.0), ("MAP", "MAP.MC", "Mapfre", "Financials", 1.0),
    ("UNI", "UNI.MC", "Unicaja", "Financials", 0.8), ("GRF", "GRF.MC", "Grifols", "Healthcare", 0.8),
    ("ANA", "ANA.MC", "Acciona", "Infrastructure & Construction", 0.6), ("MRL", "MRL.MC", "Merlin Properties", "Real estate", 0.6),
    ("PUIG", "PUIG.MC", "Puig", "Consumer", 0.5), ("ENG", "ENG.MC", "Enagás", "Utilities & Energy", 0.5),
    ("LOG", "LOG.MC", "Logista", "Travel & Transport", 0.5), ("MTS", "MTS.MC", "ArcelorMittal", "Materials & Industrials", 0.4),
    ("FDR", "FDR.MC", "Fluidra", "Materials & Industrials", 0.4), ("SCYR", "SCYR.MC", "Sacyr", "Infrastructure & Construction", 0.4),
    ("COL", "COL.MC", "Colonial", "Real estate", 0.4), ("ACX", "ACX.MC", "Acerinox", "Materials & Industrials", 0.3),
    ("ROVI", "ROVI.MC", "Rovi", "Healthcare", 0.3), ("SLR", "SLR.MC", "Solaria", "Utilities & Energy", 0.3),
    ("ANE", "ANE.MC", "Acciona Energía", "Utilities & Energy", 0.2),
]

FTSEMIB = [  # after the September 2026 review (Technoprobe in, DiaSorin out)
    ("ISP", "ISP.MI", "Intesa Sanpaolo", "Banks", 13.0), ("UCG", "UCG.MI", "UniCredit", "Banks", 13.0),
    ("ENEL", "ENEL.MI", "Enel", "Utilities", 10.0), ("RACE", "RACE.MI", "Ferrari", "Autos", 7.0),
    ("G", "G.MI", "Generali", "Insurance & Finance", 6.0), ("ENI", "ENI.MI", "Eni", "Energy", 5.5),
    ("LDO", "LDO.MI", "Leonardo", "Industrials", 4.0), ("STLAM", "STLAM.MI", "Stellantis", "Autos", 3.0),
    ("PRY", "PRY.MI", "Prysmian", "Industrials", 3.0), ("PST", "PST.MI", "Poste Italiane", "Insurance & Finance", 2.5),
    ("BAMI", "BAMI.MI", "Banco BPM", "Banks", 2.5), ("MONC", "MONC.MI", "Moncler", "Consumer & Luxury", 2.0),
    ("BPE", "BPE.MI", "BPER Banca", "Banks", 2.0), ("BMPS", "BMPS.MI", "Monte dei Paschi", "Banks", 2.0),
    ("TEN", "TEN.MI", "Tenaris", "Energy", 2.0), ("SRG", "SRG.MI", "Snam", "Utilities", 2.0),
    ("TRN", "TRN.MI", "Terna", "Utilities", 2.0), ("STMMI", "STMMI.MI", "STMicroelectronics", "Tech & Telecom", 2.0),
    ("MB", "MB.MI", "Mediobanca", "Banks", 1.5), ("FBK", "FBK.MI", "FinecoBank", "Banks", 1.5),
    ("UNI", "UNI.MI", "Unipol", "Insurance & Finance", 1.5), ("BMED", "BMED.MI", "Banca Mediolanum", "Insurance & Finance", 1.0),
    ("A2A", "A2A.MI", "A2A", "Utilities", 1.0), ("TIT", "TIT.MI", "Telecom Italia", "Tech & Telecom", 1.0),
    ("REC", "REC.MI", "Recordati", "Healthcare", 0.8), ("CPR", "CPR.MI", "Campari", "Consumer & Luxury", 0.7),
    ("TPRO", "TPRO.MI", "Technoprobe", "Tech & Telecom", 0.7), ("IVG", "IVG.MI", "Iveco", "Industrials", 0.6),
    ("HER", "HER.MI", "Hera", "Utilities", 0.6), ("IG", "IG.MI", "Italgas", "Utilities", 0.6),
    ("SPM", "SPM.MI", "Saipem", "Energy", 0.6), ("NEXI", "NEXI.MI", "Nexi", "Tech & Telecom", 0.6),
    ("BC", "BC.MI", "Brunello Cucinelli", "Consumer & Luxury", 0.6), ("BZU", "BZU.MI", "Buzzi", "Industrials", 0.6),
    ("LTMC", "LTMC.MI", "Lottomatica", "Consumer & Luxury", 0.6), ("AZM", "AZM.MI", "Azimut", "Insurance & Finance", 0.5),
    ("FCT", "FCT.MI", "Fincantieri", "Industrials", 0.5), ("INW", "INW.MI", "INWIT", "Tech & Telecom", 0.4),
    ("AVIO", "AVIO.MI", "Avio", "Industrials", 0.4), ("AMP", "AMP.MI", "Amplifon", "Healthcare", 0.3),
]

WIG20 = [  # after the March 2026 annual revision (Tauron for Orange Polska); September 2026 kept the list
    ("PKO", "PKO.WA", "PKO BP", "Banks", 15.0), ("PKN", "PKN.WA", "Orlen", "Energy & Utilities", 14.0),
    ("PEO", "PEO.WA", "Bank Pekao", "Banks", 11.0), ("PZU", "PZU.WA", "PZU", "Insurance & Finance", 8.0),
    ("KGH", "KGH.WA", "KGHM", "Materials & Industrials", 7.0), ("LPP", "LPP.WA", "LPP", "Consumer & Retail", 5.0),
    ("ALE", "ALE.WA", "Allegro", "Consumer & Retail", 4.0), ("DNP", "DNP.WA", "Dino Polska", "Consumer & Retail", 4.0),
    ("EBP", "EBP.WA", "Erste Bank Polska", "Banks", 4.0), ("CDR", "CDR.WA", "CD Projekt", "Tech & Media", 4.0),
    ("MBK", "MBK.WA", "mBank", "Banks", 4.0), ("ZAB", "ZAB.WA", "Żabka", "Consumer & Retail", 3.0),
    ("PGE", "PGE.WA", "PGE", "Energy & Utilities", 3.0), ("ALR", "ALR.WA", "Alior Bank", "Banks", 2.0),
    ("KTY", "KTY.WA", "Grupa Kęty", "Materials & Industrials", 2.0), ("TPE", "TPE.WA", "Tauron", "Energy & Utilities", 2.0),
    ("KRU", "KRU.WA", "Kruk", "Insurance & Finance", 2.0), ("MDV", "MDV.WA", "Modivo", "Consumer & Retail", 2.0),
    ("BDX", "BDX.WA", "Budimex", "Materials & Industrials", 1.5), ("PCO", "PCO.WA", "Pepco", "Consumer & Retail", 1.5),
]

FTSE100 = [  # FTSE Russell, after the September 2026 review and the 1 October 2026 replacements (WPP, Balfour Beatty)
    ("HSBA", "HSBA.L", "HSBC", "Financials", 234.2), ("SHEL", "SHEL.L", "Shell", "Energy", 222.0),
    ("AZN", "AZN.L", "AstraZeneca", "Health care", 201.3), ("ULVR", "ULVR.L", "Unilever", "Consumer staples", 107.2),
    ("RIO", "RIO.L", "Rio Tinto", "Basic materials", 107.0), ("RR", "RR.L", "Rolls-Royce", "Industrials", 104.3),
    ("BATS", "BATS.L", "British American Tobacco", "Consumer staples", 96.5), ("BP", "BP.L", "BP", "Energy", 96.1),
    ("GSK", "GSK.L", "GSK", "Health care", 77.4), ("GLEN", "GLEN.L", "Glencore", "Basic materials", 62.9),
    ("NG", "NG.L", "National Grid", "Utilities", 61.5), ("BA", "BA.L", "BAE Systems", "Industrials", 57.9),
    ("LLOY", "LLOY.L", "Lloyds Banking Group", "Financials", 57.5), ("BARC", "BARC.L", "Barclays", "Financials", 54.6),
    ("REL", "REL.L", "RELX", "Consumer discretionary", 52.7), ("NWG", "NWG.L", "NatWest Group", "Financials", 50.1),
    ("LSEG", "LSEG.L", "London Stock Exchange Group", "Financials", 45.5), ("STAN", "STAN.L", "Standard Chartered", "Financials", 43.0),
    ("AAL", "AAL.L", "Anglo American", "Basic materials", 42.7), ("CPG", "CPG.L", "Compass Group", "Industrials", 42.3),
    ("FRES", "FRES.L", "Fresnillo", "Basic materials", 40.6), ("DGE", "DGE.L", "Diageo", "Consumer staples", 39.9),
    ("CCEP", "CCEP.L", "Coca-Cola Europacific Partners", "Consumer staples", 37.5), ("RKT", "RKT.L", "Reckitt", "Consumer staples", 35.3),
    ("TSCO", "TSCO.L", "Tesco", "Consumer staples", 34.0), ("HLN", "HLN.L", "Haleon", "Health care", 33.7),
    ("SSE", "SSE.L", "SSE", "Utilities", 31.3), ("ANTO", "ANTO.L", "Antofagasta", "Basic materials", 29.8),
    ("VOD", "VOD.L", "Vodafone", "Telecoms & Tech", 27.8), ("EXPN", "EXPN.L", "Experian", "Industrials", 27.1),
    ("III", "III.L", "3i", "Financials", 23.6), ("PRU", "PRU.L", "Prudential", "Financials", 21.9),
    ("IMB", "IMB.L", "Imperial Brands", "Consumer staples", 21.6), ("AV", "AV.L", "Aviva", "Financials", 21.5),
    ("BT.A", "BT-A.L", "BT Group", "Telecoms & Tech", 21.1), ("EDV", "EDV.L", "Endeavour Mining", "Basic materials", 18.6),
    ("IHG", "IHG.L", "IHG", "Consumer discretionary", 18.2), ("NXT", "NXT.L", "Next", "Consumer discretionary", 18.1),
    ("IAG", "IAG.L", "International Airlines Group", "Consumer discretionary", 17.8), ("CCH", "CCH.L", "Coca-Cola HBC", "Consumer staples", 16.7),
    ("LGEN", "LGEN.L", "Legal & General", "Financials", 16.1), ("SMT", "SMT.L", "Scottish Mortgage", "Financials", 15.9),
    ("ABF", "ABF.L", "Associated British Foods", "Consumer staples", 13.6), ("HLMA", "HLMA.L", "Halma", "Industrials", 12.5),
    ("SGRO", "SGRO.L", "Segro", "Real estate", 12.2), ("ADM", "ADM.L", "Admiral Group", "Financials", 11.8),
    ("INF", "INF.L", "Informa", "Consumer discretionary", 11.6), ("UU", "UU.L", "United Utilities", "Utilities", 11.2),
    ("SGE", "SGE.L", "Sage Group", "Telecoms & Tech", 10.8), ("AAF", "AAF.L", "Airtel Africa", "Telecoms & Tech", 10.1),
    ("SVT", "SVT.L", "Severn Trent", "Utilities", 9.8), ("DPLM", "DPLM.L", "Diploma", "Industrials", 9.8),
    ("SN", "SN.L", "Smith & Nephew", "Health care", 9.5), ("SDLF", "SDLF.L", "Standard Life", "Financials", 9.2),
    ("ITRK", "ITRK.L", "Intertek", "Industrials", 9.1), ("BNZL", "BNZL.L", "Bunzl", "Industrials", 8.8),
    ("MKS", "MKS.L", "Marks & Spencer", "Consumer staples", 8.8), ("RTO", "RTO.L", "Rentokil Initial", "Industrials", 8.6),
    ("PSON", "PSON.L", "Pearson", "Consumer discretionary", 8.3), ("SBRY", "SBRY.L", "Sainsbury's", "Consumer staples", 7.8),
    ("MNG", "MNG.L", "M&G", "Financials", 7.5), ("SMIN", "SMIN.L", "Smiths Group", "Industrials", 7.2),
    ("CNA", "CNA.L", "Centrica", "Utilities", 6.9), ("PCT", "PCT.L", "Polar Capital Technology Trust", "Financials", 6.7),
    ("IMI", "IMI.L", "IMI", "Industrials", 6.7), ("PSH", "PSH.L", "Pershing Square Holdings", "Financials", 6.5),
    ("WEIR", "WEIR.L", "Weir", "Industrials", 6.4), ("FCIT", "FCIT.L", "F&C Investment Trust", "Financials", 6.2),
    ("MRO", "MRO.L", "Melrose Industries", "Industrials", 5.9), ("HSX", "HSX.L", "Hiscox", "Financials", 5.8),
    ("MTLN", "MTLN.L", "Metlen Energy & Metals", "Utilities", 5.7), ("KGF", "KGF.L", "Kingfisher", "Consumer discretionary", 5.7),
    ("GAW", "GAW.L", "Games Workshop", "Consumer discretionary", 5.5), ("DCC", "DCC.L", "DCC", "Industrials", 5.5),
    ("INVP", "INVP.L", "Investec", "Financials", 5.5), ("STJ", "STJ.L", "St. James's Place", "Financials", 5.5),
    ("LAND", "LAND.L", "Land Securities", "Real estate", 5.5), ("SPX", "SPX.L", "Spirax Group", "Industrials", 5.3),
    ("BGEO", "BGEO.L", "Lion Finance Group", "Financials", 5.2), ("EZJ", "EZJ.L", "easyJet", "Consumer discretionary", 5.1),
    ("CCC", "CCC.L", "Computacenter", "Telecoms & Tech", 5.1), ("CRDA", "CRDA.L", "Croda International", "Basic materials", 5.1),
    ("ICG", "ICG.L", "ICG", "Financials", 5.0), ("ALW", "ALW.L", "Alliance Witan", "Financials", 5.0),
    ("ITH", "ITH.L", "Ithaca Energy", "Energy", 4.8), ("CTEC", "CTEC.L", "Convatec", "Health care", 4.7),
    ("BAB", "BAB.L", "Babcock International", "Industrials", 4.6), ("BTRW", "BTRW.L", "Barratt Redrow", "Consumer discretionary", 4.4),
    ("LMP", "LMP.L", "LondonMetric Property", "Real estate", 4.4), ("WTB", "WTB.L", "Whitbread", "Consumer discretionary", 4.3),
    ("BLND", "BLND.L", "British Land", "Real estate", 4.3), ("HWDN", "HWDN.L", "Howden Joinery", "Industrials", 4.3),
    ("WPP", "WPP.L", "WPP", "Consumer discretionary", 4.3), ("JD", "JD.L", "JD Sports", "Consumer discretionary", 4.2),
    ("BBOX", "BBOX.L", "Tritax Big Box REIT", "Real estate", 4.2), ("AUTO", "AUTO.L", "Auto Trader", "Consumer discretionary", 4.1),
    ("ABDN", "ABDN.L", "Aberdeen Group", "Financials", 4.0), ("BRBY", "BRBY.L", "Burberry", "Consumer discretionary", 4.0),
    ("BBY", "BBY.L", "Balfour Beatty", "Industrials", 3.9), ("IGG", "IGG.L", "IG Group", "Financials", 3.3),
]

# ------------------------------------------------------------------ holidays (weekday closures, to end-2027)
EURONEXT_PARIS = ["2026-12-25", "2027-01-01", "2027-03-26", "2027-03-29"]
BME_MADRID = ["2026-12-25", "2027-01-01", "2027-03-26", "2027-03-29"]
BORSA_ITALIANA = ["2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01", "2027-03-26", "2027-03-29", "2027-12-24", "2027-12-31"]
GPW_WARSAW = ["2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01", "2027-01-06", "2027-03-26", "2027-03-29", "2027-05-03",
              "2027-05-27", "2027-11-01", "2027-11-11", "2027-12-24", "2027-12-31"]
LSE_LONDON = ["2026-12-25", "2026-12-28", "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30",
              "2027-12-27", "2027-12-28"]

# ------------------------------------------------------------------ rates and currency
# kind: ecb (ECB Data Portal flow/key), bis (BIS central bank policy rate), boe (Bank of England IADB code),
#       spread (difference of two other series, in basis points), ratio (a / b, for cross rates).
# chart: which chart the series goes in ('rates' or 'fx'); the spread gets a tile only unless chart is set.
EURO_RATES = {
    "dfr": {"kind": "ecb", "flow": "FM", "key": "D.U2.EUR.4F.KR.DFR.LEV", "label": "ECB deposit rate", "unit": "%", "chart": "rates", "step": True, "role": "policy"},
    "y10aaa": {"kind": "ecb", "flow": "YC", "key": "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y", "label": "10-year euro area AAA yield", "unit": "%", "chart": "rates", "role": "long"},
}


def euro_country(cc: str, adj: str, country: str) -> dict:
    out = dict(EURO_RATES)
    out["y10"] = {"kind": "ecb", "flow": "IRS", "key": f"M.{cc}.L.L40.CI.0000.EUR.N.Z", "label": f"10-year {adj} government yield (monthly)",
                  "unit": "%", "chart": "rates", "step": True, "role": "country"}
    out["y10de"] = {"kind": "ecb", "flow": "IRS", "key": "M.DE.L.L40.CI.0000.EUR.N.Z", "label": "10-year German yield (monthly)", "unit": "%", "hidden": True}
    out["spread"] = {"kind": "spread", "a": "y10", "b": "y10de", "label": f"{country}–Germany 10-year spread", "unit": "bp", "role": "spread"}
    out["eurusd"] = {"kind": "ecb", "flow": "EXR", "key": "D.USD.EUR.SP00.A", "label": "EUR/USD", "unit": "USD", "chart": "fx", "role": "fx"}
    return out


MARKETS = {
    "cac40": {
        "id": "cac40", "page": "cac40.html", "name": "CAC 40", "short": "CAC", "country": "France", "adj": "French",
        "exchange": "Euronext Paris", "city": "Paris", "tz": "Europe/Paris", "open": "09:00", "close": "17:30",
        "currency": "EUR", "index_yf": "^FCHI", "index_stooq": "^cac", "cap": 0.15, "corr_n": 20, "max_missing": 4,
        "members": CAC40, "holidays": EURONEXT_PARIS, "macro": euro_country("FR", "French", "France"),
        "review": "Euronext's Index Steering Committee reviews the CAC 40 quarterly (March, June, September, December).",
        "lede": "All 40 members of France's benchmark index on Euronext Paris",
    },
    "ibex35": {
        "id": "ibex35", "page": "ibex35.html", "name": "IBEX 35", "short": "IBEX", "country": "Spain", "adj": "Spanish",
        "exchange": "Bolsa de Madrid (BME)", "city": "Madrid", "tz": "Europe/Madrid", "open": "09:00", "close": "17:30",
        "currency": "EUR", "index_yf": "^IBEX", "index_stooq": "^ibex", "cap": None, "corr_n": 20, "max_missing": 4,
        "members": IBEX35, "holidays": BME_MADRID, "macro": euro_country("ES", "Spanish", "Spain"),
        "review": "BME's Technical Advisory Committee reviews the IBEX 35 in March, June, September and December.",
        "lede": "All 35 members of Spain's benchmark index on the Bolsa de Madrid",
    },
    "ftsemib": {
        "id": "ftsemib", "page": "ftsemib.html", "name": "FTSE MIB", "short": "FTSE MIB", "country": "Italy", "adj": "Italian",
        "exchange": "Euronext Milan (Borsa Italiana)", "city": "Milan", "tz": "Europe/Rome", "open": "09:00", "close": "17:30",
        "currency": "EUR", "index_yf": "FTSEMIB.MI", "index_stooq": "^fmib", "cap": 0.15, "corr_n": 20, "max_missing": 4,
        "members": FTSEMIB, "holidays": BORSA_ITALIANA, "macro": euro_country("IT", "Italian", "Italy"),
        "review": "FTSE Russell reviews the FTSE MIB quarterly (March, June, September, December).",
        "lede": "All 40 members of Italy's benchmark index on Euronext Milan",
    },
    "wig20": {
        "id": "wig20", "page": "wig20.html", "name": "WIG20", "short": "WIG20", "country": "Poland", "adj": "Polish",
        "exchange": "Warsaw Stock Exchange (GPW)", "city": "Warsaw", "tz": "Europe/Warsaw", "open": "09:00", "close": "17:00",
        "currency": "PLN", "index_yf": "WIG20.WA", "index_stooq": "wig20", "cap": 0.15, "corr_n": 20, "max_missing": 3,
        "members": WIG20, "holidays": GPW_WARSAW,
        "macro": {
            "policy": {"kind": "bis", "area": "PL", "label": "NBP reference rate", "unit": "%", "chart": "rates", "step": True, "role": "policy"},
            "y10": {"kind": "ecb", "flow": "IRS", "key": "M.PL.L.L40.CI.0000.PLN.N.Z", "label": "10-year Polish government yield (monthly)", "unit": "%",
                    "chart": "rates", "step": True, "role": "long"},
            "eurpln": {"kind": "ecb", "flow": "EXR", "key": "D.PLN.EUR.SP00.A", "label": "EUR/PLN", "unit": "PLN", "chart": "fx", "role": "fx"},
            "eurusd": {"kind": "ecb", "flow": "EXR", "key": "D.USD.EUR.SP00.A", "label": "EUR/USD", "unit": "USD", "hidden": True},
            "usdpln": {"kind": "ratio", "a": "eurpln", "b": "eurusd", "label": "USD/PLN", "unit": "PLN", "chart": "fx", "role": "fx"},
        },
        "review": "GPW Benchmark revises the WIG20 annually in March and adjusts it quarterly (June, September, December).",
        "lede": "All 20 members of Poland's blue-chip index on the Warsaw Stock Exchange",
    },
    "ftse100": {
        "id": "ftse100", "page": "ftse100.html", "name": "FTSE 100", "short": "FTSE", "country": "United Kingdom", "adj": "British",
        "exchange": "London Stock Exchange", "city": "London", "tz": "Europe/London", "open": "08:00", "close": "16:30",
        "currency": "GBP", "index_yf": "^FTSE", "index_stooq": "^ukx", "cap": None, "corr_n": 20, "max_missing": 6,
        "members": FTSE100, "holidays": LSE_LONDON,
        "macro": {
            "policy": {"kind": "boe", "code": "IUDBEDR", "fallback": {"kind": "bis", "area": "GB"}, "label": "Bank Rate", "unit": "%",
                       "chart": "rates", "step": True, "role": "policy"},
            "y10": {"kind": "boe", "code": "IUDMNPY", "label": "10-year gilt yield", "unit": "%", "chart": "rates", "role": "long"},
            "eurgbp": {"kind": "ecb", "flow": "EXR", "key": "D.GBP.EUR.SP00.A", "label": "EUR/GBP", "unit": "GBP", "hidden": True},
            "eurusd": {"kind": "ecb", "flow": "EXR", "key": "D.USD.EUR.SP00.A", "label": "EUR/USD", "unit": "USD", "hidden": True},
            "gbpusd": {"kind": "ratio", "a": "eurusd", "b": "eurgbp", "label": "GBP/USD", "unit": "USD", "chart": "fx", "role": "fx"},
            "gbpeur": {"kind": "ratio", "a": None, "b": "eurgbp", "label": "GBP/EUR", "unit": "EUR", "chart": "fx", "role": "fx"},
        },
        "review": "FTSE Russell reviews the FTSE 100 quarterly (March, June, September, December).",
        "lede": "All 100 members of the UK's benchmark index on the London Stock Exchange",
    },
}
ORDER = ["cac40", "ibex35", "ftsemib", "wig20", "ftse100"]

# ------------------------------------------------------------------ Market View (markets.html)
# Every index page, in the order of the Market View sub-navigation. The DAX page keeps its own
# scripts and data file (data/dax40.js, live.json on the live-data branch); the others follow MARKETS.
DAX_VIEW = {
    "id": "dax40", "page": "dax.html", "name": "DAX", "country": "Germany", "exchange": "Xetra", "city": "Frankfurt",
    "tz": "Europe/Berlin", "open": "09:00", "close": "17:30", "currency": "EUR",
    "data": "data/dax40.js", "series": "dax", "live_branch": "live-data", "live_file": "live.json", "live_key": "DAX",
    # must match XETRA_HOLIDAYS in assets/dax.js and HOLIDAYS in python/live_loop.py
    "holidays": ["2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01", "2027-03-26", "2027-03-29", "2027-12-24", "2027-12-31"],
}


def view_entries() -> list[dict]:
    out = [DAX_VIEW]
    for mid in ORDER:
        m = MARKETS[mid]
        out.append({"id": mid, "page": m["page"], "name": m["name"], "country": m["country"], "exchange": m["exchange"],
                    "city": m["city"], "tz": m["tz"], "open": m["open"], "close": m["close"], "currency": m["currency"],
                    "data": f"data/markets/{mid}.js", "series": "index", "live_branch": "live-markets",
                    "live_file": f"{mid}.json", "live_key": "INDEX", "holidays": m["holidays"]})
    return out
