package com.schoolsis.communication.domain.repository;

import com.schoolsis.communication.domain.model.CommunicationConsent;
import com.schoolsis.communication.domain.model.MessageChannel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ConsentRepository extends JpaRepository<CommunicationConsent, UUID> {

    @Query("SELECT c FROM CommunicationConsent c WHERE c.userId = :userId AND c.channel = :channel")
    Optional<CommunicationConsent> findByUserIdAndChannel(UUID userId, MessageChannel channel);

    @Query("SELECT c FROM CommunicationConsent c WHERE c.userId = :userId AND c.consented = true")
    List<CommunicationConsent> findActiveByUserId(UUID userId);
}
