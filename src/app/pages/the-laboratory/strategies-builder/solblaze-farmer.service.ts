import { Injectable } from '@angular/core';
import { LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { DefiStat, LabStrategyConfiguration, toastData } from 'src/app/models';
import { ApiService, DataAggregatorService, JupiterStoreService, SolanaUtilsService, TxInterceptService, UtilsService } from 'src/app/services';
import { StakePoolStoreService } from '../../defi/dapps/liquid-stake/stake-pool-store.service';
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs';
import AmmImpl, { MAINNET_POOL } from '@mercurial-finance/dynamic-amm-sdk';
import { PoolFarmImpl } from '@mercurial-finance/farming-sdk';
import { BN } from '@marinade.finance/marinade-ts-sdk';


interface MeteoraAMMpool {
  pool_address: string;
  pool_token_mints: string[];
  pool_token_amounts: string[];
  pool_token_usd_amounts: string[];
  lp_mint: string;
  pool_tvl: string;
  farm_tvl: string;
  farming_pool: null;
  farming_apy: string;
  is_monitoring: boolean;
  pool_order: number;
  farm_order: number;
  pool_version: number;
  pool_name: string;
  lp_decimal: number;
  farm_reward_duration_end: number;
  farm_expire: boolean;
  pool_lp_price_in_usd: string;
  trading_volume: number;
  fee_volume: number;
  weekly_trading_volume: number;
  weekly_fee_volume: number;
  yield_volume: string;
  accumulated_trading_volume: string;
  accumulated_fee_volume: string;
  accumulated_yield_volume: string;
  trade_apy: string;
  weekly_trade_apy: string;
  virtual_price_apy: string;
  daily_base_apy: string;
  weekly_base_apy: string;
  farm_new: boolean;
  permissioned: boolean;
  unknown: boolean;
  total_fee_pct: string;
  is_lst: boolean;
}
interface StrategySDK {
  pool: AmmImpl,
  farm: PoolFarmImpl
}
@Injectable({
  providedIn: 'root'
})

// solblaze and meteora strategy
// 1. deposit half of the sol to bsol
// 2. deposit 50% sol/bsol to meteora pool
// 3. get liquid stake rewards + mnde rewards
export class SolblazeFarmerService {
  protected _solblazePoolAddress = new PublicKey("stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi");
  protected _sol_bsol_pool_address = new PublicKey('DvWpLaNUPqoCGn4foM6hekAPKqMtADJJbJWhwuMiT6vK');
  protected _VoteKey = new PublicKey('7K8DVxtNJGnMtUY1CQJT5jcs8sFGSZTDiG7kowvFpECh');
  protected _bSOL = new PublicKey("bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1");
  protected _wSOL = new PublicKey("So11111111111111111111111111111111111111112");
  protected _meteoraAPI = 'https://app.meteora.ag';
  private _meteoraSolBsolPoolAPI: MeteoraAMMpool;
  public strategySDK: StrategySDK = { farm: null, pool: null };
  public convertRatio = 0;
  public fetchUserHoldings$ = new Subject()
  public txStatus$ = new BehaviorSubject({ totalTx: 3, finishTx: 0, start: false })
  constructor(
    private _apiService: ApiService,
    private _solanaUtilsService: SolanaUtilsService,
    private _stakePoolStore: StakePoolStoreService,
    private _jupStore: JupiterStoreService,
    private _utilService: UtilsService,
    private _txInterceptService: TxInterceptService,
  ) {
    // this.getStrategyAPY();
    // this.initPoolSDK()
  }


  public strategyConfiguration: LabStrategyConfiguration = {
    strategyName: 'solblaze-farmer',
    title: 'Solblaze Farmer Strategy',
    protocolsTitle: 'Solblaze & Meteora',
    rewardsSlogan: 'SOL + BLZE rewards',
    description: 'Solblaze Liquid Staking + Meteora Pool + Farming Strategy',
    strategyIcon: '/assets/images/icons/strategies-icons/solblaze-meteora-blze.png',
    APY_breakdown: [
      {
        icon: '/assets/images/icons/solana-logo.webp',
        description: 'Base half of 0% APY From SOL Staking Rewards'
      },
      {
        icon: '/assets/images/icons/blze.png',
        description: 'Base half 0% APY From SolBlaze DeFi boost'
      },
      {
        icon: '/assets/images/icons/solana-logo.webp',
        description: 'Base 0% APY From activity on lending platforms + trading fees'
      },
      {
        icon: '/assets/images/icons/blze.png',
        description: 'Base 0% bSOL/BLZE From Supply LP Liquidity On the farm'
      }
    ],
    risk_breakdown: [{
      riskLevel: 'low',
      description: 'Audited Smart Contract',
    },
    {
      riskLevel: 'low',
      description: 'Low depeg probability(both asset price is relative)',
    },
    {
      riskLevel: 'medium',
      description: 'Low cap pool',
    },
    {
      riskLevel: 'high',
      description: 'Multiple Smart Contract Exposure',
    }],
    strategy_breakdown: [
      {
        step: 1,
        action: 'Deposit SOL To Solblaze Pool',
        outcome: 'Get bSOL In Return',
      },
      {
        step: 2,
        action: 'Deposit into Meteora pool',
        outcome: 'GET SOL-bSOL LP in return',
      },
      {
        step: 3,
        action: 'Deposit SOL-bSOL LP into Meteora SOL-bSOL farm',
        outcome: ''
      },
    ],
    totalTransactions: 3,
    claimAssets: [{
      name: 'bSOL',
      toClaim: 0
    },
    {
      name: 'BLZE',
      toClaim: 0
    }
    ],
    assetHoldings: [
      {
        name: 'SOL',
        balance: 0,
        icon: '/assets/images/icons//solana-logo.webp',
        totalUsdValue: 0,
        baseOfPortfolio: 0
      },
      {
        name: 'bSOL',
        balance: 0,
        icon: '/assets/images/icons/blze.png',
        totalUsdValue: 0,
        baseOfPortfolio: 0
      }
    ],
    fees: [
      {
        name: 'Maximum slippage',
        desc: 'slippage that may cause for swapping different assets',
        value: 0.1
      },
      // {
      //   name: 'Deposit fee',
      //   desc: '',
      //   value: 0.008
      // },
      // {
      //   name: 'Liquidity Provider Fee',
      //   desc: 'the amount of fees charged on each trade that goes to the LPs',
      //   value: 0.0075
      // },
      // {
      //   name: 'Admin Fee',
      //   desc: 'the amount of fees charged on each trade that goes to the protocol',
      //   value: 0.0025
      // }
    ]
  }


  async initPoolSDK() {
    const tokenList = await firstValueFrom(this._jupStore.fetchTokenList());
    const SOL = tokenList.find((token) => token.address === 'So11111111111111111111111111111111111111112');
    const bSOL = tokenList.find((token) => token.address === this._bSOL.toBase58());

    this.strategySDK.pool = await AmmImpl.create(this._solanaUtilsService.connection, this._sol_bsol_pool_address, SOL, bSOL);
    const farmingPools = await PoolFarmImpl.getFarmAddressesByPoolAddress(this._sol_bsol_pool_address)
    const farm = await PoolFarmImpl.create(this._solanaUtilsService.connection, farmingPools[0].farmAddress);
    this.strategySDK.farm = farm;
  }



  // deposit strategy flow:
  //step 0 - get deposit quote for meteora pool
  // stap 1 - stake sol for bSOL
  // step 1.1 - deposit bsol/sol base on quote
  // stap 2 - deposit lp to meteora farm
  public async deposit(SOL_amount: number) {
    const sol = new BN((SOL_amount) * LAMPORTS_PER_SOL);
    const walletOwner = this._solanaUtilsService.getCurrentWallet().publicKey;
    try {
      this.txStatus$.next({ totalTx: 3, finishTx: 0, start: true })
      const { txIns, signers } = await this._bSolStake(sol);
      const tx1Res = await this._txInterceptService.sendTx(txIns, walletOwner, signers)
      if (!tx1Res) {
        this.txStatus$.next({ ...this.txStatus$.value, start: false })
        return
      }
      this.txStatus$.next({ ...this.txStatus$.value, finishTx: 1 })
      const deposit_bSOL = await this._bsolConverter('SOL', SOL_amount);
      const slippage = 0.999 // 0.1 %
      const bSOL = new BN((deposit_bSOL.converterAsset * slippage) * LAMPORTS_PER_SOL);
      const txIx2 = await this._depositToMeteoraPool(bSOL, walletOwner)

      const tx2Res = await this._txInterceptService.sendTx([txIx2], walletOwner)
      if (!tx2Res) {
        this.txStatus$.next({ ...this.txStatus$.value, start: false })
        return
      }
      this.txStatus$.next({ ...this.txStatus$.value, finishTx: 2 })
      const poolLpBalance = await this.strategySDK.pool.getUserBalance(walletOwner);
      const txIx3 = await this.strategySDK.farm.deposit(walletOwner, poolLpBalance);
      const record = {message:'solblaze-farmer strategy', data:{ type: 'deposit', amount: SOL_amount }}
      const res3 = await this._txInterceptService.sendTx([txIx3], walletOwner,null,record)
      if (!res3) {
        this.txStatus$.next({ ...this.txStatus$.value, start: false })
        return
      }
      this.txStatus$.next({ ...this.txStatus$.value, finishTx: 3 })
      setTimeout(() => {
        this.txStatus$.next({ ...this.txStatus$.value, start: false })
      }, 2000);
    } catch (error) {
      console.warn(error);
    }
  }


  // withdraw strategy flow:
  //step 0 - get get farm LP
  // stap 1 - withdraw LP balance from the farm
  // step 1 - withdraw LP from the pool for sol & bsol base on quote
  // stap 2 - swap bsol to sol
  public async withdraw() {

    const walletOwner = this._solanaUtilsService.getCurrentWallet().publicKey;
    try {
      this.txStatus$.next({ totalTx: 2, finishTx: 0, start: true })
      const farmLpBalance = await this.strategySDK.farm.getUserBalance(walletOwner);
      const txIx1 = await this.strategySDK.farm.withdraw(walletOwner, farmLpBalance);

      const tx1Res = await this._txInterceptService.sendTx([txIx1], walletOwner)
      if (!tx1Res) {
        this.txStatus$.next({ ...this.txStatus$.value, start: false })
        return
      }
      this.txStatus$.next({ ...this.txStatus$.value, finishTx: 1 })
      const poolLpBalance = await this.strategySDK.pool.getUserBalance(walletOwner);
      const txIx2 = await this._withdrawFromMeteoraPool(poolLpBalance, walletOwner)
      const record = {message:'solblaze-farmer strategy', data:{ type: 'withdraw' }}

      await this._txInterceptService.sendTx([txIx2], walletOwner,null,record)
      this.txStatus$.next({ ...this.txStatus$.value, finishTx: 2 })
      setTimeout(() => {
        this.txStatus$.next({ ...this.txStatus$.value, start: false })
      }, 2000);
    } catch (error) {
      console.warn(error);
    }
  }

  async _depositToMeteoraPool(depositAmount: BN, walletOwner: PublicKey): Promise<Transaction> {
    // Get deposit quote for constant product
    const { poolTokenAmountOut, tokenAInAmount, tokenBInAmount } = this.strategySDK.pool.getDepositQuote(
      new BN(0), // SOL
      depositAmount, // bSOL
      false,
      0.1
    );
    // console.log("out:", poolTokenAmountOut.toString(), "in a:", tokenAInAmount.toString(), "im b:", tokenBInAmount.toString())
    const depositTx = await this.strategySDK.pool.deposit(walletOwner, tokenAInAmount, tokenBInAmount, poolTokenAmountOut);
    return depositTx;
  }

  private async _withdrawFromMeteoraPool(withdrawLpAmount: BN, walletOwner: PublicKey): Promise<Transaction> {
    // Get deposit quote for constant product
    const {
      poolTokenAmountIn,
      minTokenAOutAmount,
      minTokenBOutAmount,
      tokenAOutAmount,
      tokenBOutAmount
    } = this.strategySDK.pool.getWithdrawQuote(
      withdrawLpAmount, // bSOL
      0.1,
      new PublicKey(this.strategySDK.pool.tokenA.address),
      // false
    );
    const depositTx = await this.strategySDK.pool.withdraw(walletOwner, withdrawLpAmount, tokenAOutAmount, tokenBOutAmount);
    return depositTx;
  }

  public async initStrategyStats(): Promise<{ apy, tvl }> {
    try {
      this._meteoraSolBsolPoolAPI = await this._getAMMbSOLpool()
      const apy = await this.getStrategyAPY();
      const tvl = await this.getTVL()
      this.strategyConfiguration.APY_breakdown[0].description = `Base half of ${apy.solblazeAPY.toFixedNoRounding(2)}% SOL Staking Rewards`
      this.strategyConfiguration.APY_breakdown[1].description = `Base ${apy.blzeDeFiBoostAPY.toFixedNoRounding(2)}% From SolBlaze DeFi boost`
      this.strategyConfiguration.APY_breakdown[2].description = `Base ${apy.meteoraAPY.pool.toFixedNoRounding(2)}% APY From activity on lending platforms + trading fees`
      this.strategyConfiguration.APY_breakdown[3].description = `Base ${apy.meteoraAPY.farm.toFixedNoRounding(2)}% APY bSOL/BLZE From Supply LP Liquidity On the farm`
      return { apy, tvl }
    } catch (error) {
      console.warn(error)
    }
  }

  // init all required function for the strategy 
  public async initStrategyStatefulStats(): Promise<{ userHoldings, strategyConfiguration }> {

    let userHoldings = { SOL: 0, USD: 0 }
    try {
      const walletOwner = this._solanaUtilsService.getCurrentWallet().publicKey
      if (!this.strategySDK.pool) {
        await this.initPoolSDK()
      }

      const rewards = await this.strategySDK.farm.getClaimableReward(walletOwner);
      const rewardAmountA = rewards.amountA.toNumber() / LAMPORTS_PER_SOL;
      const rewardAmountB = rewards.amountB.toNumber() / LAMPORTS_PER_SOL;
      this.strategyConfiguration.claimAssets[0].name = 'bSOL';
      this.strategyConfiguration.claimAssets[0].toClaim = rewardAmountA;

      this.strategyConfiguration.claimAssets[1].name = 'BLZE';
      this.strategyConfiguration.claimAssets[1].toClaim = rewardAmountB;

      const balances = await this.getTotalBalanceBreakDown()
      userHoldings = { SOL: balances.position_balance.SOL, USD: balances.position_balance.USD }

      const solUSDbalance = balances.position_holding.SOL * balances.SOLprice

      this.strategyConfiguration.assetHoldings[0].balance = balances.position_holding.SOL
      this.strategyConfiguration.assetHoldings[0].totalUsdValue = solUSDbalance
      this.strategyConfiguration.assetHoldings[0].baseOfPortfolio = balances.position_holding.baseOfPortfolio.SOL

      const bsolUSDbalance = balances.position_holding.bSOL / balances.assetRatio * balances.SOLprice;
      this.strategyConfiguration.assetHoldings[1].balance = balances.position_holding.bSOL
      this.strategyConfiguration.assetHoldings[1].totalUsdValue = bsolUSDbalance
      this.strategyConfiguration.assetHoldings[1].baseOfPortfolio = balances.position_holding.baseOfPortfolio.bSOL
    } catch (error) {
      console.warn(error)
    }
    return { userHoldings, strategyConfiguration: this.strategyConfiguration };
  }
  // get marinade + solend TVL
  public async getTVL(): Promise<{ SOL, USD }> {
    let tvl = { SOL: 0, USD: 0 }
    try {
      const bSOLprice = await (await this._jupStore.fetchPriceFeed('bSOL')).data['bSOL'].price;
      const poolData = await this._stakePoolStore.getStakePoolInfo(this._solblazePoolAddress)
      // (await firstValueFrom(this._apiService.get('https://cogentcrypto.io/api/stakepoolinfo'))).stake_pool_data.find(p => p.tokenSymbol === 'bSOL');
      let totalStake = poolData.totalStake;
      // let info = await stakePoolInfo(this._solanaUtilsService.connection, this._solblazePoolAddress);
      // for (let i = 0; i < info.details.stakeAccounts.length; i++) {
      //   totalStake += parseInt(info.details.stakeAccounts[i].validatorLamports);
      // }
      // let tokenAmount = info.poolTokenSupply;
      // this.convertRatio = poolData.totalStakedSol / Number(tokenAmount);
      const solPrice = bSOLprice / poolData.conversion;
      const solblazePoolTvl = totalStake * solPrice;
      const meteoraPoolTvl = Number(this._meteoraSolBsolPoolAPI.pool_tvl);
      const meteoraFarmTvl = Number(this._meteoraSolBsolPoolAPI.farm_tvl);
      tvl.USD = solblazePoolTvl + meteoraPoolTvl + meteoraFarmTvl;
      tvl.SOL = totalStake / LAMPORTS_PER_SOL
    } catch (error) {
      console.warn(error);
    }
    return tvl
  }
  private async _getAMMbSOLpool(): Promise<MeteoraAMMpool> {
    let sol_bsol_Pool;
    try {
      const meteoraAMMpools: MeteoraAMMpool[] = (await firstValueFrom(this._apiService.get(`${this._meteoraAPI}/amm/pools`)));
      sol_bsol_Pool = meteoraAMMpools.filter(pool => pool.pool_address === this._sol_bsol_pool_address.toBase58())[0];
    } catch (error) {
      console.warn(error)
    }
    return sol_bsol_Pool
  }
  public async getStrategyAPY(): Promise<{ strategyAPY, solblazeAPY: number,blzeDeFiBoostAPY: number, meteoraAPY: { pool: number, farm: number } }> {
    let strategyAPY, solblazeAPY,blzeDeFiBoostAPY, meteoraPoolAPY, meteoraFarmAPY = 0;
    try {
      if (!this._meteoraSolBsolPoolAPI) {
        this._meteoraSolBsolPoolAPI = await this._getAMMbSOLpool()
      }
      const solblazeAPI = await (await firstValueFrom(this._apiService.get('https://stake.solblaze.org/api/v1/apy')))
      solblazeAPY = solblazeAPI.base;
      blzeDeFiBoostAPY = solblazeAPI.blze * 2
      const weekly_base_apy = this._meteoraSolBsolPoolAPI.weekly_base_apy;
      const trade_apy = this._meteoraSolBsolPoolAPI.trade_apy
      meteoraPoolAPY = Number(weekly_base_apy) + Number(trade_apy);
      meteoraFarmAPY = Number(this._meteoraSolBsolPoolAPI.farming_apy);
      const meteoraAPY = meteoraPoolAPY + meteoraFarmAPY;
      // solblaze apy divided by 2 because we stake only half the amount the user want to deposit to the whole strategy
      strategyAPY = (solblazeAPY / 2) +blzeDeFiBoostAPY+ meteoraAPY;
    } catch (error) {
      console.warn(error)
    }
    return { strategyAPY, solblazeAPY,blzeDeFiBoostAPY, meteoraAPY: { pool: meteoraPoolAPY, farm: meteoraFarmAPY } };

  }
  public async getTotalBalanceBreakDown(): Promise<{ position_holding: { SOL: number, bSOL: number, baseOfPortfolio: { SOL: number, bSOL: number } }, position_balance: { SOL: number, USD: number }, assetRatio, SOLprice }> {


    try {
      let position_holding: { SOL: number, bSOL: number, baseOfPortfolio: { SOL: number, bSOL: number } } = { SOL: 0, bSOL: 0, baseOfPortfolio: { SOL: 0, bSOL: 0 } };
      let position_balance: { SOL: number, USD: number } = { SOL: 0, USD: 0 };
      const walletOwner = this._solanaUtilsService.getCurrentWallet().publicKey
      // const lpBalance = await this._getUserLpDeposit()
      const farmBalance = await this.strategySDK.farm.getUserBalance(walletOwner)
      const slippage = 0.01
      const { poolTokenAmountIn, tokenAOutAmount, tokenBOutAmount } = this.strategySDK.pool.getWithdrawQuote(farmBalance, slippage); // use lp balance for full withdrawal
      const { converterAsset, assetRatio, SOLprice } = await this._bsolConverter('bSOL', Number(tokenBOutAmount.toString()) / LAMPORTS_PER_SOL)

      position_holding.SOL = Number(tokenAOutAmount.toString()) / LAMPORTS_PER_SOL || 0
      position_holding.bSOL = Number(tokenBOutAmount.toString()) / LAMPORTS_PER_SOL || 0
      position_balance.SOL = converterAsset + position_holding.SOL
      position_balance.USD = position_balance.SOL * SOLprice
      const bSOLbase = tokenBOutAmount.toNumber() * ((1 - assetRatio) + 1) / farmBalance.toNumber() * 100 || 0
      position_holding.baseOfPortfolio.bSOL = Math.floor(bSOLbase)

      const SOLbase = tokenAOutAmount.toNumber() / farmBalance.toNumber() * 100 || 0
      position_holding.baseOfPortfolio.SOL = Math.ceil(SOLbase)

      // console.log(
      //   // 'lp:', poolTokenAmountIn.toString(),
      //   'farm balance:', farmBalance.toString(),
      //   'sol:', position_holding.SOL,
      //   'bsol:', position_holding.bSOL,
      //   'bsol converted:', converterAsset
      // )
      return { position_holding, position_balance, assetRatio, SOLprice };
    } catch (error) {
      console.warn(error)
    }
  }

  // convert back to msol/sol ratio
  private async _bsolConverter(side: 'SOL' | 'bSOL', amount: number): Promise<{ converterAsset: number, assetRatio: number, SOLprice }> {
    const bSOLprice = await (await this._jupStore.fetchPriceFeed('bSOL')).data['bSOL'].price
    const SOLprice = await (await this._jupStore.fetchPriceFeed('SOL')).data['SOL'].price
    const slippage = 0.999; // 0.01%
    try {
      const assetRatio = SOLprice / bSOLprice * slippage
      let converterAsset;
      if (side === 'SOL') {
        converterAsset = amount * assetRatio
      }
      if (side === 'bSOL') {
        converterAsset = amount / assetRatio
      }
      return { converterAsset, assetRatio, SOLprice }
    } catch (error) {
      console.warn(error)
    }
  }

  private async _bSolStake(amount: BN): Promise<{ txIns: TransactionInstruction[], signers: any }> {
    const validator = this._VoteKey;
    const walletOwner = this._solanaUtilsService.getCurrentWallet().publicKey;
    const deposit = await this._stakePoolStore.stakePoolSDK.depositSol(
      this._solanaUtilsService.connection,
      this._solblazePoolAddress,
      walletOwner,
      Number(amount),
      undefined,
    )
    try {
      let memo = JSON.stringify({
        type: "cls/validator_stake/lamports",
        value: {
          validator
        }
      });
      let memoInstruction = new TransactionInstruction({
        keys: [{
          pubkey: walletOwner,
          isSigner: true,
          isWritable: true
        }],
        programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
        data: (new TextEncoder()).encode(memo) as Buffer
      })

      const txIns: TransactionInstruction[] = [...deposit.instructions, memoInstruction]
      return { txIns, signers: deposit.signers }
      // await this._txInterceptService.sendTx([...deposit.instructions, memoInstruction], 
      //   walletOwner, deposit.signers);
      // await fetch(`https://stake.solblaze.org/api/v1/cls_stake?validator=${validator}&txid=${txId}`);

    } catch (error) {
      console.warn(error)
    }
  }

  public async claimRewards(swapToSol: boolean) {
    try {
      const walletOwner = this._solanaUtilsService.getCurrentWallet().publicKey
      const txIx = await this.strategySDK.farm.claim(walletOwner);
      await this._txInterceptService.sendTx([txIx], walletOwner);

      // TODO - ADD SWAP TO ALL CLAIMABLE REWARDS
      // if(swapToSol){
      //   const farmClaimable = await this.strategySDK.farm.getClaimableReward(walletOwner)
      //   this.swap(farmClaimable, walletOwner)
      // }
    } catch (error) {
      console.warn(error)
    }
  }

  public async swap(amount, walletOwner: PublicKey) {
    const inAmountLamport = new BN(amount * 10 ** this.strategySDK.pool.tokenB.decimals); // bSOL

    // Swap bSOL → SOL
    const swapQuote = this.strategySDK.pool.getSwapQuote(new PublicKey(this.strategySDK.pool.tokenB.address), inAmountLamport, 0.1);
    const swapTx = await this.strategySDK.pool.swap(
      walletOwner,
      new PublicKey(this.strategySDK.pool.tokenB.address),
      inAmountLamport,
      swapQuote.swapOutAmount,
    );

    await this._txInterceptService.sendTx([swapTx], walletOwner)
  }
}
