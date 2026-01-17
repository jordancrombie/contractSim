-- Add bsimUserId column to ContractParty
-- This stores the BSIM user ID for settlement requests to TransferSim

ALTER TABLE "ContractParty" ADD COLUMN "bsimUserId" TEXT;
