import React, { useContext, useEffect, useState } from "react";
import { StoreContext } from "@mybucks/contexts/Store";
import { ethers } from "ethers";
import styled from "styled-components";

import { Container, Box } from "@mybucks/components/Containers";
import BaseButton from "@mybucks/components/Button";
import { H3 } from "@mybucks/components/Texts";
import media from "@mybucks/styles/media";

import BackIcon from "@mybucks/assets/icons/back.svg";
import InfoRedIcon from "@mybucks/assets/icons/info-red.svg";
import InfoWhiteIcon from "@mybucks/assets/icons/info-white.svg";
import InfoGreenIcon from "@mybucks/assets/icons/info-green.svg";

const NavsWrapper = styled.div`
  width: 100%;
  display: flex;
  margin-bottom: ${({ theme }) => theme.sizes.xl};
`;

const TransactionDetails = styled.div`
  word-break: break-all;
  margin-bottom: ${({ theme }) => theme.sizes.xl};
  font-size: ${({ theme }) => theme.sizes.sm};
  font-weight: ${({ theme }) => theme.weights.base};
  line-height: 140%;
  color: ${({ theme }) => theme.colors.gray200};
`;

const TransactionItem = styled.span`
  font-weight: ${({ theme }) => theme.weights.highlight};
  color: ${({ theme }) => theme.colors.gray400};
`;

const ResourcesWarning = styled.div`
  word-break: break-word;
  padding: ${({ theme }) => theme.sizes.xs};
  border-radius: ${({ theme }) => theme.sizes.x3s};
  margin-bottom: ${({ theme }) => theme.sizes.xl};
  font-size: ${({ theme }) => theme.sizes.sm};
  font-weight: ${({ theme }) => theme.weights.base};
  line-height: 140%;
  background-color: ${({ theme }) => theme.colors.gray200};
  color: ${({ theme }) => theme.colors.gray25};
`;

const InvalidTransfer = styled.div`
  padding: 0.25rem 0.625rem;
  border-radius: ${({ theme }) => theme.sizes.x3s};
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  margin-bottom: ${({ theme }) => theme.sizes.base};
  font-weight: ${({ theme }) => theme.weights.base};
  font-size: ${({ theme }) => theme.sizes.xs};
  line-height: 180%;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizes.x2s};

  ${media.sm`
    margin-bottom: ${({ theme }) => theme.sizes.xl};
  `}
`;

const ButtonsWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizes.xl};

  ${media.sm`
    flex-direction: column;
    gap: ${({ theme }) => theme.sizes.xs};
  `}
`;

const Button = styled(BaseButton)`
  width: 17rem;

  ${media.sm`
    width: 100%;
  `}
`;

const ConfirmTransaction = ({
  token,
  recipient,
  amount,
  transaction,
  bandwidth,
  energy,
  onSuccess,
  onReject,
}) => {
  const { account, fetchBalances, nativeTokenName, nativeTokenPrice } =
    useContext(StoreContext);

  const [bandwidthEstimation, setBandwidthEstimation] = useState(0);
  const [energyEstimation, setEnergyEstimation] = useState(0);
  const [trxBurntEstimation, setTrxBurntEstimation] = useState(0);

  const [hasError, setHasError] = useState(false);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    setHasError(false);

    try {
      const txn = await account.execute(transaction);

      // update balances
      fetchBalances();
      onSuccess(txn);
    } catch (e) {
      setHasError(true);
    }

    setPending(false);
  };

  return (
    <Container>
      <NavsWrapper>
        <button onClick={onReject} disabled={pending}>
          <img src={BackIcon} />
        </button>
      </NavsWrapper>

      <Box>
        <H3>Confirm transaction</H3>

        <TransactionDetails>
          <p>
            <TransactionItem>To:</TransactionItem> {recipient}
          </p>

          <p>
            <TransactionItem>Value:</TransactionItem> {amount}{" "}
            {token.contractTickerSymbol}
          </p>
        </TransactionDetails>

        <TransactionDetails>
          <p>
            <TransactionItem>Consumption:</TransactionItem> {bandwidth} Bandwidth
            + {energy} Energy
          </p>
        </TransactionDetails>

        <ResourcesWarning>
          If your bandwidth or energy is insufficient, the remaining fee should
          be paid in TRX.
        </ResourcesWarning>

        {hasError ? (
          <InvalidTransfer>
            <img src={InfoRedIcon} />
            <span>Failed to execute! Please check balances.</span>
          </InvalidTransfer>
        ) : (
          ""
        )}

        <ButtonsWrapper>
          <Button onClick={confirm} disabled={pending | hasError}>
            Confirm
          </Button>
          <Button onClick={onReject} disabled={pending} $variant="secondary">
            Reject
          </Button>
        </ButtonsWrapper>
      </Box>
    </Container>
  );
};

export default ConfirmTransaction;
