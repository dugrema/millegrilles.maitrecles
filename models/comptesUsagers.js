const debug = require('debug')('millegrilles:maitrecomptes:comptesUsagers')
const multibase = require('multibase')

const { extraireInformationCertificat } = require('@dugrema/millegrilles.common/lib/forgecommon')
const { hacher } = require('@dugrema/millegrilles.common/lib/hachage')
const { dechiffrerDocument } = require('@dugrema/millegrilles.common/lib/chiffrage')

class ComptesUsagers {

  constructor(amqDao) {
    this.amqDao = amqDao
    this.idmg = amqDao.pki.idmg
    this.proprietairePresent = false
  }

  infoMillegrille = async () => {
    // Verifie si la MilleGrille est initialisee. Conserve le IDMG
    if( ! this.proprietairePresent ) {
      // Faire une requete pour recuperer l'information
      const domaineAction = 'MaitreDesComptes.infoProprietaire'
      const requete = {}
      debug("Requete info proprietaire")
      const compteProprietaire = await this.amqDao.transmettreRequete(
        domaineAction, requete, {decoder: true})

      debug("Reponse compte proprietaire")
      debug(compteProprietaire)

      if(compteProprietaire.cles) {
        this.proprietairePresent = true
      }
    }

    return {
      idmg: this.idmg,
      proprietairePresent: this.proprietairePresent
    }
  }

  infoCompteProprietaire = async () => {

    const domaineAction = 'MaitreDesComptes.infoProprietaire'
    const requete = {}
    debug("Requete info proprietaire")
    const compteProprietaire = await this.amqDao.transmettreRequete(
      domaineAction, requete, {decoder: true})

    debug("Reponse compte proprietaire")
    debug(compteProprietaire)

    if( compteProprietaire.u2f ) {
      debug("Requete info proprietaire, recu : %s", compteProprietaire)
      return compteProprietaire
    } else {
      debug("Requete compte usager, compte proprietaire inexistant")
      return false
    }

  }

  chargerCompte = async (nomUsager, fingerprintPk) => {
    if( ! nomUsager ) throw new Error("Usager undefined")
    
    const domaineAction = 'MaitreDesComptes.chargerUsager'
    const requete = {nomUsager}
    debug("Requete compte usager %s", nomUsager)

    const promiseCompteUsager = this.amqDao.transmettreRequete(
      domaineAction, requete, {decoder: true})
      .then(compteUsager=>{

        if(compteUsager.nomUsager) {
          debug("Requete compte usager, recu %s : %s", nomUsager, compteUsager)
          return compteUsager
        } else {
          debug("Requete compte usager, compte %s inexistant", nomUsager)
          return false
        }

      })

    var promiseFingerprintPk = null
    if(fingerprintPk) {
      const domaineAction = 'Pki.certificatParPk'
      const requete = {fingerprint_pk: fingerprintPk}
      promiseFingerprintPk = this.amqDao.transmettreRequete(
        domaineAction, requete, {decoder: true})
        .then(resultat=>{
          if(resultat.certificat) return resultat.certificat
          else return false
        })
    }

    const resultats = await Promise.all([promiseCompteUsager, promiseFingerprintPk])
    return ({compteUsager: resultats[0], certificat: resultats[1]})

  }

  prendrePossession = async(compte) => {
    const domaineAction = 'MaitreDesComptes.inscrireProprietaire'
    const transaction = {...compte}
    debug("Transaction inscrire proprietaire")
    debug(transaction)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Inscription proprietaire completee")
  }

  inscrireCompte = async nomUsager => {
    const domaineAction = 'MaitreDesComptes.inscrireUsager'
    const transaction = {nomUsager}
    debug("Transaction inscrire compte usager %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Inscription compte usager %s completee", nomUsager)
  }

  changerMotdepasse = async (nomUsager, motdepasse) => {
    const domaineAction = 'MaitreDesComptes.majMotdepasse'
    const transaction = {nomUsager, motdepasse}
    debug("Transaction changer mot de passe de %s, nomUsager")
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction changer mot de passe de %s completee", nomUsager)
  }

  changerCleComptePrive = async (nomUsager, nouvelleCle) => {
    const domaineAction = 'MaitreDesComptes.majCleUsagerPrive'
    const transaction = {nomUsager, cle: nouvelleCle}
    debug("Transaction changer mot de passe de %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction changer mot de passe de %s completee", nomUsager)
  }

  supprimerMotdepasse = async (nomUsager) => {
    const domaineAction = 'MaitreDesComptes.suppressionMotdepasse'
    const transaction = {nomUsager}
    debug("Transaction supprimer mot de passe de %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction supprimer mot de passe de %s completee", nomUsager)
  }

  ajouterCle = async (nomUsager, cle, resetCles) => {
    const domaineAction = 'MaitreDesComptes.ajouterCle'
    const transaction = {nomUsager, cle}
    if(resetCles) {
      transaction['reset_cles'] = true
    }
    debug("Transaction ajouter cle U2F pour %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction ajouter cle U2F pour %s completee", nomUsager)
  }

  ajouterCleProprietaire = async (cle, resetCles) => {
    const domaineAction = 'MaitreDesComptes.ajouterCle'
    const transaction = {
      cle,
      est_proprietaire: true,
    }
    if(resetCles) {
      transaction['reset_cles'] = true
    }
    debug("Transaction ajouter cle U2F pour proprietaire")
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction ajouter cle U2F pour proprietaire completee")
  }

  associerIdmg = async (nomUsager, idmg, opts) => {
    if(!opts) opts = {}

    const domaineAction = 'MaitreDesComptes.associerCertificat'
    const transaction = {nomUsager, idmg}
    if(opts.resetCles) {
      transaction['reset_idmg'] = true
    }
    if(opts.cle) {
      transaction['cle'] = opts.cle
    }
    if(opts.chaineCertificats) {
      transaction['chaine_certificats'] = opts.chaineCertificats
    }
    debug("Transaction associer idmg %s pour %s", idmg, nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction associer idmg %s pour %s completee", idmg, nomUsager)
  }

  supprimerCles = async (nomUsager) => {
    const domaineAction = 'MaitreDesComptes.supprimerCles'
    const transaction = {nomUsager}
    debug("Transaction supprimer cles U2F %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction supprimer cles U2F de %s completee", nomUsager)
  }

  supprimerUsager = async (nomUsager) => {
    const domaineAction = 'MaitreDesComptes.supprimerUsager'
    const transaction = {nomUsager}
    debug("Transaction supprimer usager %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction supprimer usager %s completee", nomUsager)
  }

  ajouterCertificatNavigateur = async (nomUsager, params) => {
    const domaineAction = 'MaitreDesComptes.ajouterNavigateur'
    const transaction = {nomUsager, ...params}
    debug("Transaction ajouter certificat navigateur compte usager %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction ajouter certificat navigateur compte usager %s completee", nomUsager)
  }

  requeteCleProprietaireTotp = async ciphertext => {
    const hachageContenu = await hacher(
      multibase.decode(ciphertext), {encoding: 'base58btc', hashingCode: 'sha2-512'})

    const liste_hachage_bytes = [hachageContenu]

    const requeteCleSecrete = {
      domaine: 'MaitreDesComptes',
      liste_hachage_bytes,
    }

    debug("requeteCleProprietaireTotp: Requete cle secrete pour %s\n%O", hachageContenu, requeteCleSecrete)

    const domaineAction = 'MaitreDesCles.dechiffrage'

    const messageCle = await this.amqDao.transmettreRequete(
      domaineAction, requeteCleSecrete, {decoder: true, attacherCertificat: true})
    debug("Information pour dechiffrer TOTP recu : %O", messageCle)

    if(messageCle.acces !== '1.permis') {throw new Error("Acces secret TOTP refuse")}

    // // Dechiffrer cle secrete
    const pki = this.amqDao.pki
    const clePrivee = pki.cleForge
    const infoCle = messageCle.cles[hachageContenu]
    debug("Information cle pour dechiffrer TOTP : %O", infoCle)
    // const cleSecreteDechiffreeStr = await pki.dechiffrerContenuAsymetric(infoCle.cle, infoCle.iv, ciphertext)
    //
    // debug("requeteCleProprietaireTotp: Cle secrete dechiffree : %O", cleSecreteDechiffreeStr)
    // const cleSecreteDechiffree = JSON.parse(cleSecreteDechiffreeStr)

    const cleSecreteDechiffree = await dechiffrerDocument(ciphertext, infoCle, clePrivee)

    return cleSecreteDechiffree
  }

  verifierMotdepasseUsager = async (nomUsager, ciphertext, motdepasse) => {
    const hachageContenu = await hacher(
      multibase.decode(ciphertext), {encoding: 'base58btc', hashingCode: 'sha2-512'})

    const liste_hachage_bytes = [hachageContenu]

    const requeteCleSecrete = {
      domaine: 'MaitreDesComptes',
      liste_hachage_bytes,
    }

    debug("requeteCleProprietaireMotdepasse: Requete cle secrete pour %s\n%O", hachageContenu, requeteCleSecrete)

    const domaineAction = 'MaitreDesCles.dechiffrage'

    const messageCle = await this.amqDao.transmettreRequete(
      domaineAction, requeteCleSecrete, {decoder: true, attacherCertificat: true})
    debug("Information pour dechiffrer mot de passe recu : %O", messageCle)

    if(messageCle.acces !== '1.permis') {throw new Error("Acces secret mot de passe refuse")}

    // // Dechiffrer cle secrete
    const pki = this.amqDao.pki
    const clePrivee = pki.cleForge
    const infoCle = messageCle.cles[hachageContenu]
    debug("Information cle pour dechiffrer mot de passe : %O", infoCle)
    // const cleSecreteDechiffreeStr = await pki.dechiffrerContenuAsymetric(infoCle.cle, infoCle.iv, ciphertext)
    //
    // debug("requeteCleProprietaireTotp: Cle secrete dechiffree : %O", cleSecreteDechiffreeStr)
    // const cleSecreteDechiffree = JSON.parse(cleSecreteDechiffreeStr)

    const documentMotdepasseDechiffre = await dechiffrerDocument(ciphertext, infoCle, clePrivee)

    const motdepasseDechiffre = documentMotdepasseDechiffre.motdepasse

    // Comparer les mots de passe
    if( motdepasseDechiffre === motdepasse ) {
      return true
    }
    throw new Error("Mot de passe ne correspond pas")
  }

  relayerTransaction = async (transaction) => {
    debug("relayerTransaction : %O", transaction)
    const confirmation = await this.amqDao.transmettreEnveloppeTransaction(transaction)
    debug("Confirmation relayer transactions : %O", confirmation)
    return confirmation
  }

  signerCertificatNavigateur = async (csr, nomUsager, estProprietaire) => {
    const domaineAction = 'commande.servicemonitor.signerNavigateur'
    const params = {csr, nomUsager, estProprietaire}

    try {
      debug("Commande signature certificat navigateur %O", params)
      const reponse = await this.amqDao.transmettreCommande(domaineAction, params, {decoder: true})
      debug("Reponse commande signature certificat : %O", reponse)
      return reponse
    } catch(err) {
      debug("Erreur traitement liste applications\n%O", err)
    }
  }

  emettreCertificatNavigateur = async (fullchainPems) => {
    // Verifier les certificats et la signature du message
    // Permet de confirmer que le client est bien en possession d'une cle valide pour l'IDMG
    // const { cert: certNavigateur, idmg } = validerChaineCertificats(fullchain)
    const infoCertificat = extraireInformationCertificat(fullchainPems[0])
    debug("Information certificat navigateur : %O", infoCertificat)
    let messageInfoCertificat = {
        fingerprint: infoCertificat.fingerprintBase64,
        fingerprint_sha256_b64: infoCertificat.fingerprintSha256Base64,
        chaine_pem: fullchainPems,
    }
    const domaineAction = 'evenement.certificat.infoCertificat'
    try {
      debug("Emettre certificat navigateur fingerprint: %s", infoCertificat.fingerprintBase64)
      await this.amqDao.emettreEvenement(messageInfoCertificat, domaineAction)
    } catch(err) {
      debug("Erreur emission certificat\n%O", err)
    }
  }

}

// Fonction qui injecte l'acces aux comptes usagers dans req
function init(amqDao) {
  const comptesUsagers = new ComptesUsagers(amqDao)

  const injecterComptesUsagers = async (req, res, next) => {
    debug("Injection req.comptesUsagers")
    req.comptesUsagers = comptesUsagers  // Injecte db de comptes
    next()
  }

  const extraireUsager = async (req, res, next) => {

    const nomUsager = req.nomUsager  // Doit avoir ete lu par sessions.js
    const estProprietaire = req.sessionUsager?req.sessionUsager.estProprietaire:false
    if(estProprietaire) {
      debug("Chargement compte proprietaire")
      const compte = await comptesUsagers.infoCompteProprietaire()
      if(compte) {
        req.compteUsager = compte
      }

    } else if(nomUsager) {
      debug('Nom usager %s', nomUsager)

      // Extraire compte usager s'il existe
      const compte = await comptesUsagers.chargerCompte(nomUsager)
      if(compte) {
        req.compteUsager = compte
      }
    }

    next()
  }

  return {injecterComptesUsagers, extraireUsager}
}

module.exports = {init}
